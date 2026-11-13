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
import { withMetadataMutation } from "medior/server/database/metadata-mutations";
import { metadataWriteOptions, registerMetadataWork } from "medior/server/database/metadata-work";
import {
  chunkArray,
  dayjs,
  FileTranslationSource,
  Fmt,
  getCaptionTranslation,
  getNameTranslation,
  getTitleTranslation,
  hasTranscription,
  MediaProgramTitleTranslation,
  SubtitleSegment,
  TEXT_SUBTITLE_CODECS,
  TranslationDisplay,
} from "medior/utils/common";
import {
  Config,
  getConfig,
  getIsVideo,
  leanModelToJson,
  makeAction,
  socket,
} from "medior/utils/server";
import { runNativeTask } from "medior/utils/server/native-task";
import { probeSubtitleStreams, readSubtitleSegments } from "medior/utils/server/subtitles";

/** Texts sent to the translation worker at once, so progress and stopping follow closely. */
const TRANSLATION_BATCH_SIZE = 8;

interface CaptionSource {
  label: string;
  readSegments: () => Promise<SubtitleSegment[]>;
  source: FileTranslationSource;
}

interface EpisodeTitleTranslationRequest {
  /** Translates again the titles that already have a translation into the target language. */
  force?: boolean;
  id: string;
  titles: string[];
}

interface FileTranslationRequest {
  fileId: string;
  /** Translates again what already has a translation into the target language, replacing it. */
  force?: boolean;
  /** What to translate, or everything the file has when omitted. */
  sources?: FileTranslationSource[];
}

/** The requests waiting in each running episode title translation, which later requests join. */
const titleTranslationQueues = new Map<string, EpisodeTitleTranslationRequest[]>();

/** The requests waiting in each running translation, which later requests join. */
const translationQueues = new Map<string, FileTranslationRequest[]>();

/* -------------------------------------------------------------------------- */
/*                              HELPER FUNCTIONS                              */
/* -------------------------------------------------------------------------- */
const isRequested = (sources: FileTranslationSource[], source: FileTranslationSource) =>
  !sources || sources.includes(source);

/**
 * Translates each distinct text once, in batches that report the job's progress and are handed to
 * `onBatch` as they finish.
 */
const translateTexts = async (
  job: Job,
  config: Config["file"]["translation"],
  texts: string[],
  label: string,
  onBatch?: (batch: string[], results: string[]) => Promise<void>,
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

    await onBatch?.(batch, results);
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

/** Replaces the program's title translations with what `update` makes of them, in every window. */
const updateTitleTranslations = (
  id: string,
  update: (translations: MediaProgramTitleTranslation[]) => MediaProgramTitleTranslation[],
) =>
  withMetadataMutation(async () => {
    const program = await models.MediaProgramModel.findById(id)
      .select({ titleTranslations: 1 })
      .lean();
    if (!program) throw new Error("The media program was not found.");

    const updates = {
      dateModified: dayjs().toISOString(),
      titleTranslations: update(program.titleTranslations ?? []),
    };

    await models.MediaProgramModel.updateOne(
      { _id: id },
      { $set: updates },
      metadataWriteOptions(),
    );

    socket.emitVolatile("onMediaProgramUpdated", { id, updates });
  });

/**
 * Translates the program's episode titles that have no translation into the target language yet,
 * or all of them again with `force`, saving each batch as it finishes so a stopped translation
 * keeps them. Resolves to how many titles were translated.
 */
const translateEpisodeTitles = async (
  job: Job,
  { force, id, titles }: EpisodeTitleTranslationRequest,
) => {
  const config = getConfig().file.translation;
  const { language } = config;

  const program = await models.MediaProgramModel.findById(id)
    .select({ name: 1, titleTranslations: 1 })
    .lean();
  if (!program) throw new Error("The media program was not found.");

  const pendingTitles = force
    ? titles
    : titles.filter((title) => !getTitleTranslation(program, title, language));

  job.report({ item: program.name, message: "Starting translation.", stepProgress: null });

  await translateTexts(job, config, pendingTitles, "titles", async (batch, results) => {
    const texts = new Map(batch.map((text, index) => [text, results[index]]));
    const batchTitles = pendingTitles.filter((title) => texts.has(title.trim()));
    const batchTitleSet = new Set(batchTitles);

    await updateTitleTranslations(id, (translations) => [
      ...translations.filter(
        (translation) => translation.language !== language || !batchTitleSet.has(translation.title),
      ),
      ...batchTitles.map((title) => ({
        // Translating again keeps the saved choice of what shows on episode cards.
        display: getTitleTranslation({ titleTranslations: translations }, title, language)?.display,
        language,
        text: texts.get(title.trim()),
        title,
      })),
    ]);
  });

  return pendingTitles.length;
};

/* -------------------------------------------------------------------------- */
/*                                API ENDPOINTS                               */
/* -------------------------------------------------------------------------- */
/**
 * Chooses whether the program's saved translations of the episode titles into the target language
 * or the titles show on episode cards. Titles without a translation are left as they are.
 */
export const saveEpisodeTitleTranslations = makeAction(
  async ({
    display,
    id,
    titles,
  }: {
    display: TranslationDisplay;
    id: string;
    titles: string[];
  }) => {
    const { language } = getConfig().file.translation;
    const titleSet = new Set(titles);

    await updateTitleTranslations(id, (translations) =>
      translations.map((translation) =>
        translation.language === language && titleSet.has(translation.title)
          ? { ...translation, display }
          : translation,
      ),
    );
  },
);

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
 * Translates programs' episode titles from their metadata into the target language on the server,
 * one program at a time, storing them with each program. Titles sent while a translation runs join
 * it, so the translation model stays loaded. With `force`, titles that already have a translation
 * are translated again.
 */
export const startEpisodeTitleTranslation = makeAction(
  async ({ force, id, titles }: { force?: boolean; id: string; titles: string[] }) => {
    const request = { force, id, titles: [...new Set(titles)] };
    let runningId = findJob("translateEpisodeTitles");

    // A stopping translation takes no more requests, so a new one starts once it has ended.
    if (runningId && isJobStopping(runningId)) {
      await waitForJob(runningId);
      runningId = findJob("translateEpisodeTitles");
    }

    const runningQueue = titleTranslationQueues.get(runningId);

    if (runningQueue) {
      addToJob(runningId, [], 1);
      runningQueue.push(request);

      return runningId;
    } else
      return startJob({
        label: "Episode Title Translation",
        run: async (job) => {
          const queue = [request];
          let translatedCount = 0;

          titleTranslationQueues.set(job.id, queue);

          try {
            // The queue holds only waiting requests, which later translations add to.
            while (queue.length) {
              const queued = queue.shift();

              job.signal.throwIfAborted();

              try {
                translatedCount += await translateEpisodeTitles(job, queued);
              } catch (error) {
                job.signal.throwIfAborted();
                job.addFailure(error.message);
              }

              job.complete([], 1);
            }
          } finally {
            titleTranslationQueues.delete(job.id);
          }

          job.report({
            message:
              translatedCount === 1
                ? "Translated 1 title."
                : `Translated ${Fmt.commas(translatedCount)} titles.`,
            stepProgress: null,
          });
        },
        total: 1,
        type: "translateEpisodeTitles",
      });
  },
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
