import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import * as models from "medior/_generated/server/models";
import { isServerStopping } from "trabecula/utils/process";
import { fileLog } from "trabecula/utils/server";
import * as actions from "medior/server/database/actions";
import { normalizeSourceFolderPath } from "medior/server/database/actions/collections";
import { backgroundExecution } from "medior/server/database/background-execution";
import { runOutsideLockOwner } from "medior/server/database/file-locks";
import {
  readMediaProgramSeasons,
  removeMediaProgramImageFolder,
  removeMediaProgramImages,
} from "medior/server/database/media-program-seasons";
import { metadataWork } from "medior/server/database/metadata-context";
import { metadataMutation, withMetadataMutation } from "medior/server/database/metadata-mutations";
import { metadataWriteOptions } from "medior/server/database/metadata-work";
import {
  getIsMediaProgramMetaKind,
  getMediaProgramMetaKind,
  getMediaProgramMetaSeasonNumbers,
  getMediaProgramMetaSourceOrder,
  getSeasonEpisodeNumbers,
  MediaProgramMeta,
  MediaProgramMetaMatch,
  MediaProgramMetaSource,
  MediaProgramSeasonMeta,
  sleep,
} from "medior/utils/common";
import {
  getAvailableFileStorage,
  getConfig,
  leanModelToJson,
  makeAction,
  socket,
} from "medior/utils/server";
import {
  downloadMediaProgramImage,
  fetchMediaProgramSource,
  searchMediaProgramSource,
  SourceEpisode,
  SourceSeason,
} from "medior/utils/server/media-program-sources";
import { runConcurrent, workSignal } from "medior/utils/server/work-signal";

const IMAGE_CONCURRENCY = 4;

const IMAGE_FOLDER = "_media-programs";

/** Room for a program's poster, backdrop, season posters, and episode stills. */
const IMAGE_STORAGE_BYTES = 200 * 1024 ** 2;

const IMPORTER_WAIT_MS = 30_000;

/** Each program's latest metadata load or clear, so only the newest one is saved. */
const metaGenerations = new Map<string, number>();

/** Programs waiting for metadata, and whether those without any may be matched by name. */
const metaQueue = new Map<string, { canSearch: boolean }>();

let metaQueueRun: Promise<void> = null;

/* -------------------------------------------------------------------------- */
/*                              HELPER FUNCTIONS                              */
/* -------------------------------------------------------------------------- */
/**
 * Downloads the match's details and images, then saves them to the program and its matching
 * seasons, keeping every episode and season the source lists so the missing ones show. A load or
 * clear started meanwhile discards this one.
 */
const applyMediaProgramMeta = async (id: string, match: MediaProgramMetaMatch) => {
  const generation = startMetaGeneration(id);

  const program = await models.MediaProgramModel.findById(id).select({ seasons: 1 }).lean();
  if (!program) throw new Error("Media program not found");

  const seasons = readMediaProgramSeasons(program.seasons);
  const seasonNumbers = getMediaProgramMetaSeasonNumbers(seasons);
  const source = await fetchMediaProgramSource(match);

  const storage = await getAvailableFileStorage(IMAGE_STORAGE_BYTES);
  if (!storage.success) throw new Error(storage.error);

  // Each download has its own folder, so open windows never show a replaced image from their cache.
  const folderPath = path.join(storage.data.location, IMAGE_FOLDER, id, randomUUID());
  const imageUrls = new Map([
    ["banner", source.bannerUrl],
    ["poster", source.posterUrl],
  ]);
  const seasonSources = new Map<
    string,
    { episodes: SourceEpisode[]; name: string; season: SourceSeason }
  >();

  for (const [index, season] of seasons.entries()) {
    const sourceSeason = source.seasons.get(seasonNumbers[index]);
    if (!sourceSeason) continue;

    const name = `season-${index + 1}`;
    const episodeNumbers = new Set(getSeasonEpisodeNumbers(season));

    seasonSources.set(season.id, { episodes: sourceSeason.episodes, name, season: sourceSeason });
    imageUrls.set(name, sourceSeason.posterUrl);

    // Episodes match the source's by number, so only those with files get stills.
    for (const episode of sourceSeason.episodes) {
      if (episodeNumbers.has(episode.number))
        imageUrls.set(`${name}-episode-${episode.number}`, episode.stillUrl);
    }
  }

  const imagePaths = new Map<string, string>();
  let replaced: Pick<models.MediaProgramSchema, "meta" | "seasons"> = null;

  await fs.mkdir(folderPath, { recursive: true });

  try {
    await runConcurrent(
      [...imageUrls].filter(([, url]) => url),
      IMAGE_CONCURRENCY,
      async ([name, url]) => {
        const imagePath = await downloadMediaProgramImage(url, folderPath, name);
        if (imagePath) imagePaths.set(name, imagePath);
      },
    );

    const meta: MediaProgramMeta = {
      ...source.details,
      bannerPath: imagePaths.get("banner") ?? null,
      posterPath: imagePaths.get("poster") ?? null,
      seasons: [...source.seasons].map(([number, season]) => ({
        episodes: season.episodes.map((episode) => ({
          airDate: episode.airDate,
          number: episode.number,
          stillPath: null,
          title: episode.title,
        })),
        number,
        startDate: season.startDate,
        title: season.title,
      })),
    };

    const seasonMetas = new Map<string, MediaProgramSeasonMeta>(
      [...seasonSources].map(([seasonId, { episodes, name, season }]) => [
        seasonId,
        {
          episodes: episodes.map((episode) => ({
            airDate: episode.airDate,
            number: episode.number,
            stillPath: imagePaths.get(`${name}-episode-${episode.number}`) ?? null,
            title: episode.title,
          })),
          posterPath: imagePaths.get(name) ?? null,
          startDate: season.startDate,
          title: season.title,
        },
      ]),
    );

    replaced = await withMetadataMutation(async () => {
      if (generation !== metaGenerations.get(id)) return null;

      const current = await models.MediaProgramModel.findById(id)
        .select({ meta: 1, seasons: 1, year: 1 })
        .lean();

      if (!current) return null;

      // Source dates start with the year, which a program without one takes as when it started airing.
      const startYear = meta.startDate ? Number(meta.startDate.slice(0, 4)) : null;

      // Seasons added during the download get their metadata on the next refresh.
      const updates = {
        isMetaPending: false,
        meta,
        seasons: readMediaProgramSeasons(current.seasons).map((season) => ({
          ...season,
          meta: seasonMetas.get(season.id) ?? null,
        })),
        ...(!current.year && startYear ? { year: startYear } : {}),
      };

      await models.MediaProgramModel.updateOne(
        { _id: id },
        { $set: updates },
        metadataWriteOptions(),
      );

      socket.emitVolatile("onMediaProgramUpdated", { id, updates });

      return current;
    });
  } catch (error) {
    await removeDownload(folderPath);

    throw error;
  }

  if (replaced) await removeMediaProgramImages([replaced]);

  // An unsaved download, or one that saved no images, is referenced by nothing.
  if (!replaced || !imagePaths.size) await removeDownload(folderPath);
};

/** Programs with unfinished import batches while the importer runs. */
const getImportingProgramIds = async () => {
  const status = await actions.getImporterStatus(null);
  if (!status.success || !status.data.isImporting) return new Set<string>();

  const batches = await models.FileImportBatchModel.find({
    isCompleted: false,
    "mediaProgram.sourceFolderPath": { $type: "string" },
  })
    .select({ "mediaProgram.sourceFolderPath": 1 })
    .lean();

  const programs = await models.MediaProgramModel.find({
    sourceFolderKey: {
      $in: batches.map((batch) => normalizeSourceFolderPath(batch.mediaProgram.sourceFolderPath)),
    },
  })
    .select({ _id: 1 })
    .lean();

  return new Set(programs.map(({ _id }) => String(_id)));
};

/**
 * The top search result for the program's name from the first source that finds any. A program with
 * a year is searched for in that year at every source before any is searched without it. At each
 * year searched, a Movie or Show program takes a result of its kind from any source before the
 * first source's result of another kind.
 */
const findMediaProgramMatch = async (
  program: Pick<models.MediaProgramSchema, "name" | "type" | "year">,
): Promise<MediaProgramMetaMatch> => {
  const kind = getMediaProgramMetaKind(program.type);
  const sources = getMediaProgramMetaSourceOrder(getConfig().mediaPrograms.apiKeys);

  for (const year of program.year ? [program.year, null] : [null]) {
    let otherKind: MediaProgramMetaMatch = null;

    for (const source of sources) {
      const results = await searchMediaProgramSource(source, program.name, year);
      const result = results.find((candidate) => getIsMediaProgramMetaKind(candidate, kind));
      if (result) return { isMovie: result.isMovie, source, sourceId: result.sourceId };

      if (!otherKind && results.length)
        otherKind = { isMovie: results[0].isMovie, source, sourceId: results[0].sourceId };
    }

    if (otherKind) return otherKind;
  }

  return null;
};

/**
 * Refreshes a program's metadata from its source, or matches it by name when allowed or when an
 * import left a match waiting. A failed match keeps waiting, to be tried again on the next start.
 */
const loadMediaProgramMeta = async (id: string, canSearch: boolean) => {
  const program = await models.MediaProgramModel.findById(id)
    .select({ isMetaPending: 1, meta: 1, name: 1, type: 1, year: 1 })
    .lean();

  if (!program || (!program.meta && !canSearch && !program.isMetaPending)) return;

  const match: MediaProgramMetaMatch = program.meta
    ? {
        isMovie: program.meta.isMovie,
        source: program.meta.source,
        sourceId: program.meta.sourceId,
      }
    : await findMediaProgramMatch(program);

  if (match) await applyMediaProgramMeta(id, match);
  else {
    fileLog(`No metadata found for media program "${program.name}"`);

    await withMetadataMutation(() =>
      models.MediaProgramModel.updateOne(
        { _id: id },
        { $set: { isMetaPending: false } },
        metadataWriteOptions(),
      ),
    );
  }
};

const queueMediaProgramMeta = (ids: string[], canSearch: boolean) => {
  if (!getConfig().mediaPrograms.metaLookups) return;

  for (const id of ids)
    metaQueue.set(id, { canSearch: canSearch || !!metaQueue.get(id)?.canSearch });

  if (!metaQueue.size) return;

  // Loading continues after the request that queued it, outside of that request's contexts.
  metaQueueRun ??= metadataMutation.exit(() =>
    metadataWork.exit(() =>
      backgroundExecution.exit(() => workSignal.exit(() => runOutsideLockOwner(runMetaQueue))),
    ),
  );
};

/** Deletes a download that was not saved, with its program's image folder if nothing else is in it. */
const removeDownload = async (folderPath: string) => {
  await fs.rm(folderPath, { force: true, recursive: true });
  await removeMediaProgramImageFolder(path.dirname(folderPath));
};

/**
 * Loads queued programs one at a time. A program with seasons still importing waits for them, so it
 * loads its metadata and images once rather than after each season.
 */
const runMetaQueue = async () => {
  try {
    while (metaQueue.size && !isServerStopping()) {
      // Lookups turned off in Settings drop the queue, though imported programs keep waiting.
      if (!getConfig().mediaPrograms.metaLookups) {
        metaQueue.clear();
        break;
      }

      let importingIds: Set<string>;

      try {
        importingIds = await getImportingProgramIds();
      } catch (error) {
        fileLog(`Failed to check which media programs are importing: ${error.message}`, {
          type: "error",
        });

        await sleep(IMPORTER_WAIT_MS);
        continue;
      }

      const next = [...metaQueue].find(([id]) => !importingIds.has(id));

      if (!next) await sleep(IMPORTER_WAIT_MS);
      else {
        const [id, { canSearch }] = next;

        metaQueue.delete(id);

        try {
          await loadMediaProgramMeta(id, canSearch);
        } catch (error) {
          fileLog(`Failed to load metadata for media program ${id}: ${error.message}`, {
            type: "error",
          });
        }
      }
    }
  } finally {
    metaQueueRun = null;
  }
};

const startMetaGeneration = (id: string) => {
  const generation = (metaGenerations.get(id) ?? 0) + 1;

  metaGenerations.set(id, generation);

  return generation;
};

/**
 * Loads metadata for a program an import added to. Only programs an import created are matched by
 * name, including one whose match is still waiting, so metadata cleared by hand stays cleared.
 */
// @generator-ignore-export
export const queueImportedMediaProgramMeta = (program: { id: string; isCreated: boolean }) =>
  queueMediaProgramMeta([program.id], program.isCreated);

/** Queues the matches imports left waiting, such as when the server last stopped. */
// @generator-ignore-export
export const resumeMediaProgramMetaMatches = async () => {
  try {
    const programs = await models.MediaProgramModel.find({ isMetaPending: true })
      .select({ _id: 1 })
      .lean();

    queueMediaProgramMeta(
      programs.map(({ _id }) => String(_id)),
      false,
    );
  } catch (error) {
    fileLog(`Failed to resume media program metadata matches: ${error.message}`, { type: "error" });
  }
};

/** Matches programs without metadata by name and refreshes the rest, one at a time. */
// @generator-ignore-export
export const queueMediaProgramMetaMatch = (ids: string[]) => queueMediaProgramMeta(ids, true);

/** Refreshes the metadata of programs that have it, so changed seasons get theirs. */
// @generator-ignore-export
export const queueMediaProgramMetaRefresh = (ids: string[]) => queueMediaProgramMeta(ids, false);

/* -------------------------------------------------------------------------- */
/*                                API ENDPOINTS                               */
/* -------------------------------------------------------------------------- */
/** Matches the programs to metadata in the background, refreshing those already matched. */
export const matchMediaProgramsMeta = makeAction(async ({ ids }: { ids: string[] }) => {
  queueMediaProgramMetaMatch(ids);
});

export const searchMediaProgramMeta = makeAction(
  async ({
    query,
    source,
    year,
  }: {
    query: string;
    source: MediaProgramMetaSource;
    year: number | null;
  }) => (query.trim() ? searchMediaProgramSource(source, query.trim(), year) : []),
);

/** Saves the chosen match's metadata to the program, or clears its metadata without one. */
export const setMediaProgramMeta = makeAction(
  async ({ id, match }: { id: string; match: MediaProgramMetaMatch | null }) => {
    if (match) await applyMediaProgramMeta(id, match);
    else {
      // A load still downloading is discarded rather than restoring what was cleared.
      startMetaGeneration(id);

      const cleared = await withMetadataMutation(async () => {
        const current = await models.MediaProgramModel.findById(id)
          .select({ meta: 1, seasons: 1 })
          .lean();

        if (!current) throw new Error("Media program not found");

        const updates = {
          isMetaPending: false,
          meta: null,
          seasons: readMediaProgramSeasons(current.seasons).map((season) => ({
            ...season,
            meta: null,
          })),
        };

        await models.MediaProgramModel.updateOne(
          { _id: id },
          { $set: updates },
          metadataWriteOptions(),
        );

        socket.emitVolatile("onMediaProgramUpdated", { id, updates });

        return current;
      });

      await removeMediaProgramImages([cleared]);
    }

    return leanModelToJson<models.MediaProgramSchema>(
      await models.MediaProgramModel.findById(id).lean(),
    );
  },
);
