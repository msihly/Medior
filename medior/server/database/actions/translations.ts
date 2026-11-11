import * as models from "medior/_generated/server/models";
import * as actions from "medior/server/database/actions";
import {
  addToJob,
  findJob,
  isJobStopping,
  Job,
  startJob,
  waitForJob,
} from "medior/server/database/jobs";
import { registerMetadataWork } from "medior/server/database/metadata-work";
import {
  chunkArray,
  FileTranslationSource,
  Fmt,
  getCaptionTranslation,
  getNameTranslation,
  hasTranscription,
  SubtitleSegment,
  TEXT_SUBTITLE_CODECS,
  TranslationDisplay,
} from "medior/utils/common";
import { Config, getConfig, getIsVideo, leanModelToJson, makeAction } from "medior/utils/server";
import { runNativeTask } from "medior/utils/server/native-task";
import { probeSubtitleStreams, readSubtitleSegments } from "medior/utils/server/subtitles";

/** Texts sent to the translation worker at once, so progress and stopping follow closely. */
const TRANSLATION_BATCH_SIZE = 8;

interface CaptionSource {
  label: string;
  readSegments: () => Promise<SubtitleSegment[]>;
  source: FileTranslationSource;
}

interface FileTranslationRequest {
  fileId: string;
  /** Translates again what already has a translation into the target language, replacing it. */
  force?: boolean;
  /** What to translate, or everything the file has when omitted. */
  sources?: FileTranslationSource[];
}

/** The requests waiting in each running translation, which later requests join. */
const translationQueues = new Map<string, FileTranslationRequest[]>();

/* -------------------------------------------------------------------------- */
/*                              HELPER FUNCTIONS                              */
/* -------------------------------------------------------------------------- */
const isRequested = (sources: FileTranslationSource[], source: FileTranslationSource) =>
  !sources || sources.includes(source);

/** Translates each distinct text once, in batches that report the job's progress. */
const translateTexts = async (
  job: Job,
  config: Config["file"]["translation"],
  texts: string[],
  label: string,
) => {
  const uniqueTexts = [...new Set(texts.map((text) => text.trim()).filter(Boolean))];
  const translations = new Map<string, string>();

  for (const batch of chunkArray(uniqueTexts, TRANSLATION_BATCH_SIZE)) {
    job.signal.throwIfAborted();
    job.report({
      message: `Translating ${label}: ${Fmt.commas(translations.size)} of ${Fmt.commas(uniqueTexts.length)}.`,
      stepProgress: Math.round((translations.size / uniqueTexts.length) * 100),
    });

    const results = await runNativeTask<string[]>(
      "translation",
      { config, language: config.language, texts: batch },
      job.signal,
      (message, progress) => job.report({ message, stepProgress: progress ?? null }),
    );

    batch.forEach((text, index) => translations.set(text, results[index]));
  }

  return texts.map((text) => translations.get(text.trim()) ?? text);
};

/** The transcript and subtitles of a file that the request asks for. */
const getCaptionSources = async (
  job: Job,
  file: models.FileSchema,
  sources: FileTranslationSource[],
) => {
  const captionSources: CaptionSource[] = [];

  if (isRequested(sources, "transcript") && hasTranscription(file.transcription))
    captionSources.push({
      label: "transcript",
      readSegments: async () =>
        file.transcription.segments?.length
          ? file.transcription.segments
          : [{ end: file.duration ?? 0, start: 0, text: file.transcription.text }],
      source: "transcript",
    });

  for (const [index, subtitle] of (file.subtitles ?? []).entries()) {
    const source: FileTranslationSource = `subtitle:${subtitle.pathKey}`;

    if (subtitle.ext !== "idx" && isRequested(sources, source))
      captionSources.push({
        label: `subtitle ${index + 1}`,
        readSegments: () => readSubtitleSegments({ filePath: subtitle.path, signal: job.signal }),
        source,
      });
  }

  const isStreamRequested = !sources || sources.some((source) => source.startsWith("stream:"));

  if (isStreamRequested && getIsVideo(file.ext)) {
    try {
      const streams = await probeSubtitleStreams(file.path, job.signal);

      for (const stream of streams.filter(({ codec }) => TEXT_SUBTITLE_CODECS.includes(codec))) {
        const source: FileTranslationSource = `stream:${stream.index}`;

        if (isRequested(sources, source))
          captionSources.push({
            label: `subtitle track ${stream.label || stream.lang || stream.index + 1}`,
            readSegments: () =>
              readSubtitleSegments({
                filePath: file.path,
                signal: job.signal,
                streamIndex: stream.index,
              }),
            source,
          });
      }
    } catch (error) {
      job.signal.throwIfAborted();
      job.addFailure(`Could not read subtitle tracks: ${error.message}`);
    }
  }

  return captionSources;
};

/**
 * Translates what a file has not had translated into the target language yet, or all of it again
 * with `force`, saving each part as it finishes so a stopped translation keeps them. Settings saved
 * meanwhile apply from the next file, so each file's translations share one language.
 */
const translateFile = async (job: Job, { fileId, force, sources }: FileTranslationRequest) => {
  const config = getConfig().file.translation;
  const { language } = config;

  const fileModel = await models.FileModel.findById(fileId).lean();
  if (!fileModel) throw new Error("The file was not found.");

  const file = leanModelToJson<models.FileSchema>(fileModel);

  const save = async (
    updates: Partial<Pick<models.FileSchema, "captionTranslations" | "nameTranslations">>,
  ) => {
    const res = await actions.updateFile({ args: { id: fileId, updates } });
    if (!res.success) throw new Error(res.error);
  };

  job.report({ item: file.originalName, message: "Starting translation.", stepProgress: null });

  const nameTranslation = getNameTranslation(file, language);

  if (isRequested(sources, "name") && file.originalName && (force || !nameTranslation)) {
    const [text] = await translateTexts(job, config, [file.originalName], "name");

    await save({
      nameTranslations: [
        ...(file.nameTranslations ?? []).filter((translation) => translation.language !== language),
        // Translating again keeps the saved choice of what shows on file cards.
        { display: nameTranslation?.display, language, name: file.originalName, text },
      ],
    });
  }

  let captionTranslations = [...(file.captionTranslations ?? [])];

  for (const { label, readSegments, source } of await getCaptionSources(job, file, sources)) {
    if (!force && getCaptionTranslation(file, source, language)) continue;

    let segments: SubtitleSegment[];

    try {
      segments = await readSegments();
    } catch (error) {
      job.signal.throwIfAborted();
      job.addFailure(`Could not read ${label}: ${error.message}`);

      continue;
    }

    if (!segments.length) continue;

    const texts = await translateTexts(
      job,
      config,
      segments.map(({ text }) => text),
      label,
    );

    const translatedSegments = segments.map(({ end, start }, index) => ({
      end,
      start,
      text: texts[index],
    }));

    captionTranslations = [
      ...captionTranslations.filter(
        (translation) => translation.language !== language || translation.source !== source,
      ),
      {
        language,
        segments: translatedSegments,
        source,
        text: translatedSegments.map(({ text }) => text).join("\n"),
      },
    ];

    await save({ captionTranslations });
  }
};

/* -------------------------------------------------------------------------- */
/*                                API ENDPOINTS                               */
/* -------------------------------------------------------------------------- */
/**
 * Chooses whether the files' saved name translations into the target language or their names show
 * on file cards. Files without a translation of their current name are left as they are.
 */
export const saveNameTranslations = makeAction(
  registerMetadataWork(
    "saveNameTranslations",
    async ({ display, fileIds }: { display: TranslationDisplay; fileIds: string[] }) => {
      const { language } = getConfig().file.translation;

      const files = await models.FileModel.find({ _id: { $in: fileIds } })
        .select({ nameTranslations: 1, originalName: 1 })
        .lean();

      for (const file of files.map((file) => leanModelToJson<models.FileSchema>(file))) {
        const nameTranslation = getNameTranslation(file, language);
        if (!nameTranslation) continue;

        const res = await actions.updateFile({
          args: {
            id: file.id,
            updates: {
              nameTranslations: file.nameTranslations.map((translation) =>
                translation === nameTranslation ? { ...translation, display } : translation,
              ),
            },
          },
        });

        if (!res.success) throw new Error(res.error);
      }
    },
    { getFileIds: ({ fileIds }) => fileIds },
  ),
);

/**
 * Translates files' names, transcripts, and subtitles into the target language on the server, one
 * file at a time, storing them with each file. Files sent while a translation runs join it. With
 * `force`, what already has a translation is translated again.
 */
export const startFileTranslation = makeAction(
  async ({
    fileIds,
    force,
    sources,
  }: {
    fileIds: string[];
    force?: boolean;
    sources?: FileTranslationSource[];
  }) => {
    const uniqueIds = [...new Set(fileIds)];
    const requests = uniqueIds.map((fileId) => ({ fileId, force, sources }));
    let runningId = findJob("translateFiles");

    // A stopping translation still holds its files, so a new one starts once it has ended.
    if (runningId && isJobStopping(runningId)) {
      await waitForJob(runningId);
      runningId = findJob("translateFiles");
    }

    const runningQueue = translationQueues.get(runningId);

    if (runningQueue) {
      addToJob(runningId, uniqueIds);
      runningQueue.push(...requests);

      return runningId;
    } else
      return startJob({
        fileIds: uniqueIds,
        label: "File Translation",
        run: async (job) => {
          const queue = [...requests];

          translationQueues.set(job.id, queue);

          try {
            // The queue holds only waiting requests, which later translations add to.
            while (queue.length) {
              const request = queue.shift();

              job.signal.throwIfAborted();

              try {
                await translateFile(job, request);
              } catch (error) {
                job.signal.throwIfAborted();
                job.addFailure(error.message);
              }

              // A file queued again during its translation stays locked for the next one.
              job.complete(
                queue.some(({ fileId }) => fileId === request.fileId) ? [] : [request.fileId],
                1,
              );
            }
          } finally {
            translationQueues.delete(job.id);
          }
        },
        type: "translateFiles",
      });
  },
);
