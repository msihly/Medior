import path from "path";
import { randomUUID } from "crypto";
import * as models from "medior/_generated/server/models";
import { fileLog } from "trabecula/utils/server";
import * as actions from "medior/server/database/actions";
import { normalizeSourceFolderPath } from "medior/server/database/actions/collections";
import {
  readMediaProgramSeasons,
  removeMediaProgramImages,
} from "medior/server/database/media-program-seasons";
import { withMetadataMutation } from "medior/server/database/metadata-mutations";
import { metadataSaveOptions, metadataWriteOptions } from "medior/server/database/metadata-work";
import {
  addSeasonEpisodes,
  countMissingEpisodes,
  dayjs,
  getAverageRating,
  getLastEpisodeNumber,
  getMediaProgramEpisodeIds,
  getMediaProgramMetaSeasonNumbers,
  getMediaProgramMissingEpisodes,
  getMediaProgramSeasonOutlines,
  getMissingEpisodeKey,
  getSeasonEpisodeNumbers,
  getSeasonSortKey,
  getWatchStatusOrder,
  isDeepEqual,
  MEDIA_PROGRAM_WATCH_STATUSES,
  MediaProgramImport,
  MediaProgramMissingMarks,
  MediaProgramSeason,
  MediaProgramSeasonInput,
  MediaProgramSeasonOutline,
  MediaProgramWatchStatus,
  normalizeSeasonEpisodes,
  parseMediaProgramName,
  parseSeasonNumber,
  sumArray,
} from "medior/utils/common";
import { getConfig, leanModelToJson, makeAction, objectIds, socket } from "medior/utils/server";

type MediaProgramAttrs = ReturnType<typeof readMediaProgramAttrs>;

type MediaProgramUpdates = Partial<
  Pick<
    models.MediaProgramSchema,
    | "genreIds"
    | "isRewatching"
    | "language"
    | "medium"
    | "missingMarks"
    | "name"
    | "rating"
    | "ratingIsManual"
    | "type"
    | "watchStatus"
    | "year"
  >
> & { seasons?: MediaProgramSeasonInput[] };

/* -------------------------------------------------------------------------- */
/*                              HELPER FUNCTIONS                              */
/* -------------------------------------------------------------------------- */
/**
 * Whether saved seasons lack metadata the new ones need: a season was added or now matches another
 * source season, such as after renumbering or reordering unnumbered seasons, or one has an episode
 * at a number it had none at when its metadata, with stills for those numbers, was downloaded.
 */
const getNeedsMetaRefresh = (saved: MediaProgramSeason[], seasons: MediaProgramSeason[]) => {
  const savedNumbers = getMediaProgramMetaSeasonNumbers(saved);
  const savedById = new Map(saved.map((season, index) => [season.id, { index, season }]));
  const numbers = getMediaProgramMetaSeasonNumbers(seasons);

  return seasons.some((season, index) => {
    const savedSeason = savedById.get(season.id);
    const savedEpisodeNumbers = new Set(
      savedSeason ? getSeasonEpisodeNumbers(savedSeason.season) : [],
    );

    return (
      !savedSeason ||
      savedNumbers[savedSeason.index] !== numbers[index] ||
      getSeasonEpisodeNumbers(season).some((number) => !savedEpisodeNumbers.has(number))
    );
  });
};

const getWatchStatus = (
  current: MediaProgramWatchStatus,
  {
    isComplete,
    isWatched,
    markedCount,
  }: { isComplete: boolean; isWatched: boolean; markedCount: number },
): MediaProgramWatchStatus => {
  if (isComplete) return "watched";
  // Only unmarking leaves nothing watched; skipping an episode without a file marks nothing.
  else if (!isWatched && !markedCount && ["watched", "watching"].includes(current))
    return "unwatched";
  // A program set to Watched stays so while episodes are replayed; unmarking one reopens it.
  else if (current === "watched") return isWatched ? "watched" : "watching";
  else if (markedCount && isWatched) return "watching";
  else return current;
};

/** Seasons with unique IDs and episodes, keeping the saved metadata of seasons that existed. */
const normalizeSeasons = (seasons: MediaProgramSeasonInput[], saved: MediaProgramSeason[]) => {
  const savedById = new Map(saved.map((season) => [season.id, season]));
  const seenIds = new Set<string>();

  return seasons.map((season): MediaProgramSeason => {
    const id = season.id && !seenIds.has(season.id) ? season.id : randomUUID();

    seenIds.add(id);

    return {
      ...normalizeSeasonEpisodes({
        episodeNumbers: season.episodeNumbers,
        fileIds: [...new Set(season.fileIds.map(String))],
      }),
      id,
      label: season.label.trim(),
      meta: savedById.get(id)?.meta ?? null,
      number: season.number ?? null,
      rating: season.rating ?? 0,
      ratingIsManual: !!season.ratingIsManual,
    };
  });
};

/** The derived program fields in a comparable form, with IDs as strings. */
const readMediaProgramAttrs = (
  program: Pick<
    models.MediaProgramSchema,
    | "fileCount"
    | "posterFileId"
    | "rating"
    | "rewatchedFileIds"
    | "seasons"
    | "size"
    | "tagIds"
    | "watchedFileIds"
  >,
) => ({
  fileCount: program.fileCount,
  posterFileId: program.posterFileId ? String(program.posterFileId) : null,
  rating: program.rating,
  rewatchedFileIds: program.rewatchedFileIds.map(String),
  seasons: readMediaProgramSeasons(program.seasons),
  size: program.size,
  tagIds: program.tagIds.map(String),
  watchedFileIds: program.watchedFileIds.map(String),
});

/**
 * Derives the seasons' ratings and the program's episode count, size, rating, tags, and poster from
 * its episodes, saving only what changed. Given seasons and marks replace the saved ones.
 */
const writeMediaProgramAttrs = async (
  id: string,
  changes: Partial<Pick<MediaProgramAttrs, "rewatchedFileIds" | "seasons" | "watchedFileIds">> = {},
) => {
  const program = await models.MediaProgramModel.findById(id)
    .select({
      fileCount: 1,
      isRewatching: 1,
      meta: 1,
      missingMarks: 1,
      posterFileId: 1,
      rating: 1,
      ratingIsManual: 1,
      rewatchedFileIds: 1,
      seasons: 1,
      size: 1,
      tagIds: 1,
      watchedFileIds: 1,
      watchStatus: 1,
    })
    .lean();

  if (!program) return;

  const current = readMediaProgramAttrs(program);
  const base = { ...current, ...changes };

  const files = new Map(
    (
      await models.FileModel.find({
        _id: { $in: objectIds(getMediaProgramEpisodeIds(base.seasons)) },
      })
        .select({ rating: 1, size: 1, tagIds: 1 })
        .lean()
    ).map((file) => [String(file._id), file]),
  );

  // Files deleted elsewhere drop out of their seasons here, and the others keep their numbers.
  const seasons = base.seasons.map((season) => {
    const episodes = normalizeSeasonEpisodes({
      episodeNumbers: normalizeSeasonEpisodes(season).episodeNumbers,
      fileIds: season.fileIds.filter((fileId) => files.has(fileId)),
    });

    return {
      ...season,
      ...episodes,
      rating: season.ratingIsManual
        ? season.rating
        : getAverageRating(episodes.fileIds.map((fileId) => files.get(fileId).rating)),
    };
  });

  const episodeIds = getMediaProgramEpisodeIds(seasons);
  const episodeIdSet = new Set(episodeIds);

  const attrs = readMediaProgramAttrs({
    fileCount: episodeIds.length,
    posterFileId: episodeIds[0] ?? null,
    rating: program.ratingIsManual
      ? program.rating
      : getAverageRating(seasons.map((season) => season.rating)),
    rewatchedFileIds: base.rewatchedFileIds.filter((fileId) => episodeIdSet.has(fileId)),
    seasons,
    size: sumArray(episodeIds, (fileId) => files.get(fileId).size),
    tagIds: [
      ...new Set(episodeIds.flatMap((fileId) => files.get(fileId).tagIds.map(String))),
    ].sort(),
    watchedFileIds: base.watchedFileIds.filter((fileId) => episodeIdSet.has(fileId)),
  });

  const updates: Partial<models.MediaProgramSchema> = Object.fromEntries(
    Object.entries(attrs).filter(([key, value]) => !isDeepEqual(current[key], value)),
  );

  if (updates.tagIds)
    updates.tagIdsWithAncestors = await actions.deriveAncestorTagIds(attrs.tagIds);

  // The watch status follows episodes or marks that season changes added or removed, leaving a
  // status set by hand alone otherwise. A rewatch keeps its own. Episodes without files finish the
  // program once each was watched elsewhere or skipped.
  if (!program.isRewatching) {
    const missing = countMissingEpisodes(
      getMediaProgramMissingEpisodes(program.meta, seasons),
      program.missingMarks,
    );
    const watchedCount = attrs.watchedFileIds.length;
    const isComplete =
      attrs.fileCount > 0 && watchedCount === attrs.fileCount && missing.watched === missing.total;

    // New episodes reopen a finished program.
    if (
      program.watchStatus === "watched" &&
      attrs.fileCount > current.fileCount &&
      watchedCount &&
      !isComplete
    )
      updates.watchStatus = "watching";
    else if (
      program.watchStatus === "watching" &&
      isComplete &&
      (updates.watchedFileIds || attrs.fileCount !== current.fileCount)
    )
      updates.watchStatus = "watched";
    // Episodes imported as watched start an unwatched program.
    else if (program.watchStatus === "unwatched" && watchedCount > current.watchedFileIds.length)
      updates.watchStatus = isComplete ? "watched" : "watching";
    else if (
      updates.watchedFileIds &&
      !watchedCount &&
      !missing.watched &&
      ["watched", "watching"].includes(program.watchStatus)
    )
      updates.watchStatus = "unwatched";
  }

  if (updates.watchStatus) updates.watchStatusOrder = getWatchStatusOrder(updates.watchStatus);

  if (Object.keys(updates).length) {
    await models.MediaProgramModel.updateOne(
      { _id: id },
      { $set: updates },
      metadataWriteOptions(),
    );

    socket.emitVolatile("onMediaProgramUpdated", { id, updates });
  }
};

/**
 * Marks apply to the rewatch when one is active; finishing a rewatch counts it and clears its marks.
 * Episodes without files count as marked when watched elsewhere, and a viewing finishes once each
 * of them was watched elsewhere or skipped.
 */
const writeWatchedFileIds = async (
  program: models.MediaProgramSchema & { _id: unknown },
  fileIds: string[],
  isWatched: boolean,
) => {
  const id = String(program._id);
  const seasons = readMediaProgramSeasons(program.seasons);
  const episodeIds = getMediaProgramEpisodeIds(seasons);
  const missing = countMissingEpisodes(
    getMediaProgramMissingEpisodes(program.meta, seasons),
    program.missingMarks,
  );
  const dateModified = dayjs().toISOString();
  const fileIdSet = new Set(fileIds);
  const marked = new Set(
    (program.isRewatching ? program.rewatchedFileIds : program.watchedFileIds).map(String),
  );

  for (const fileId of fileIds) {
    if (isWatched) marked.add(fileId);
    else marked.delete(fileId);
  }

  const markedIds = episodeIds.filter((fileId) => marked.has(fileId));
  const isComplete =
    episodeIds.length > 0 &&
    markedIds.length === episodeIds.length &&
    missing.watched === missing.total;
  const lastWatchedFileId = episodeIds.filter((fileId) => fileIdSet.has(fileId)).at(-1);

  const updates: Partial<models.MediaProgramSchema> = {
    dateModified,
    ...(isWatched && lastWatchedFileId ? { dateLastWatched: dateModified, lastWatchedFileId } : {}),
    ...(program.isRewatching
      ? isComplete
        ? {
            isRewatching: false,
            rewatchCount: (program.rewatchCount ?? 0) + 1,
            rewatchedFileIds: [],
            watchStatus: "watched",
          }
        : { rewatchedFileIds: markedIds }
      : {
          watchedFileIds: markedIds,
          watchStatus: getWatchStatus(program.watchStatus, {
            isComplete,
            isWatched,
            markedCount: markedIds.length + missing.watched,
          }),
        }),
  };

  if (updates.watchStatus) updates.watchStatusOrder = getWatchStatusOrder(updates.watchStatus);

  await models.MediaProgramModel.updateOne({ _id: id }, { $set: updates }, metadataWriteOptions());

  socket.emitVolatile("onMediaProgramUpdated", { id, updates });

  return updates;
};

/**
 * Adds an import batch's files to its program's season, creating the program and season when they
 * don't exist. Seasons are matched by number, then label. Resolves to the program's ID and
 * whether this import created it.
 */
// @generator-ignore-export
export const addImportedMediaProgramSeason = (args: {
  fileIds: string[];
  mediaProgram: MediaProgramImport;
}) =>
  withMetadataMutation(async () => {
    const { mediaProgram } = args;
    const dateModified = dayjs().toISOString();
    const sourceFolderKey = normalizeSourceFolderPath(mediaProgram.sourceFolderPath);

    // Blank import fields leave an existing program's saved values in place.
    const fields = Object.fromEntries(
      Object.entries({
        language: mediaProgram.language,
        medium: mediaProgram.medium,
        name: mediaProgram.name?.trim(),
        type: mediaProgram.type,
        year: mediaProgram.year,
      }).filter(([, value]) => value !== null && value !== undefined && value !== ""),
    );

    const existing = await models.MediaProgramModel.findOne({ sourceFolderKey })
      .select({ _id: 1 })
      .lean();

    // A program deleted after the scan is recreated under its folder's name.
    if (!existing && !fields.name)
      fields.name = parseMediaProgramName(path.win32.basename(mediaProgram.sourceFolderPath)).name;

    const updated = await models.MediaProgramModel.findOneAndUpdate(
      { sourceFolderKey },
      {
        $set: { dateModified, ...fields },
        $setOnInsert: {
          dateCreated: dateModified,
          fileCount: 0,
          genreIds: [],
          // Saved, so a match an import queues survives a restart until it's tried. Programs imported
          // while lookups are off wait for none, so turning them on never matches them unasked.
          isMetaPending: getConfig().mediaPrograms.metaLookups,
          isRewatching: false,
          meta: null,
          rating: 0,
          rewatchCount: 0,
          rewatchedFileIds: [],
          seasons: [],
          size: 0,
          sourceFolderPath: mediaProgram.sourceFolderPath,
          tagIds: [],
          tagIdsWithAncestors: [],
          watchedFileIds: [],
          watchStatus: "unwatched",
          watchStatusOrder: getWatchStatusOrder("unwatched"),
        },
      },
      { ...metadataWriteOptions(), returnDocument: "after", upsert: true },
    ).lean();

    const program = leanModelToJson<models.MediaProgramSchema>(updated);

    if (!existing) socket.emitVolatile("onMediaProgramCreated", program);

    const { seasonLabel, seasonNumber } = mediaProgram;
    const seasons = readMediaProgramSeasons(program.seasons);
    const season =
      seasons.find(({ number }) => seasonNumber !== null && number === seasonNumber) ??
      seasons.find(({ label }) => label.toLowerCase() === seasonLabel.toLowerCase());

    const files = await models.FileModel.find({ _id: { $in: objectIds(args.fileIds) } })
      .select({ originalName: 1 })
      .lean();

    const fileNames = new Map(files.map((file) => [String(file._id), file.originalName]));
    // Episodes take the numbers their names give when they can, such as 16 to 18 of a season.
    const addedFiles = [...new Set(args.fileIds)].map((id) => ({
      id,
      name: fileNames.get(id) ?? "",
    }));

    if (season) Object.assign(season, addSeasonEpisodes(season, addedFiles));
    else {
      // A new season goes after the last one numbered before it, keeping the program's own order.
      const sortKey = getSeasonSortKey(seasonNumber);
      const index = seasons.findLastIndex(({ number }) => getSeasonSortKey(number) <= sortKey);

      seasons.splice(index + 1, 0, {
        ...addSeasonEpisodes({ episodeNumbers: {}, fileIds: [] }, addedFiles),
        id: randomUUID(),
        label: seasonLabel,
        meta: null,
        number: seasonNumber,
        rating: 0,
        ratingIsManual: false,
      });
    }

    await writeMediaProgramAttrs(program.id, {
      seasons,
      ...(mediaProgram.isWatched
        ? { watchedFileIds: [...new Set([...program.watchedFileIds.map(String), ...args.fileIds])] }
        : {}),
    });

    // A status chosen at import replaces the one that follows from the watched episodes.
    if (mediaProgram.watchStatus) {
      const updates = {
        watchStatus: mediaProgram.watchStatus,
        watchStatusOrder: getWatchStatusOrder(mediaProgram.watchStatus),
      };

      await models.MediaProgramModel.updateOne(
        { _id: program.id },
        { $set: updates },
        metadataWriteOptions(),
      );

      socket.emitVolatile("onMediaProgramUpdated", { id: program.id, updates });
    }

    return { id: program.id, isCreated: !existing };
  });

/** Saves the viewing order beside the watch status of programs saved before it was kept. */
// @generator-ignore-export
export const fillMediaProgramWatchStatusOrders = async () => {
  const statuses = MEDIA_PROGRAM_WATCH_STATUSES.map(({ value }) => value);

  try {
    await withMetadataMutation(() =>
      models.MediaProgramModel.updateMany(
        { watchStatusOrder: { $exists: false } },
        [{ $set: { watchStatusOrder: { $indexOfArray: [statuses, "$watchStatus"] } } }],
        { ...metadataWriteOptions(), updatePipeline: true },
      ),
    );
  } catch (error) {
    fileLog(`Failed to save media program watch status orders: ${error.message}`, {
      type: "error",
    });
  }
};

/**
 * Rederives the programs holding the files after their ratings, tags, or sizes changed, or after
 * they were deleted, which drops them from their seasons.
 */
// @generator-ignore-export
export const regenMediaProgramsByFileIds = (fileIds: string[]) =>
  withMetadataMutation(async () => {
    if (!fileIds.length) return;

    const programs = await models.MediaProgramModel.find({
      "seasons.fileIds": { $in: fileIds },
    })
      .select({ _id: 1 })
      .lean();

    for (const program of programs) await writeMediaProgramAttrs(String(program._id));
  });

/** Puts the file a duplicate was merged into in the duplicate's place, keeping its watch marks. */
// @generator-ignore-export
export const replaceMediaProgramFile = (fileId: string, replacementId: string) =>
  withMetadataMutation(async () => {
    const replaceId = (fileIds: string[]) => [
      ...new Set(fileIds.map((id) => (String(id) === fileId ? replacementId : String(id)))),
    ];

    const programs = await models.MediaProgramModel.find({ "seasons.fileIds": fileId })
      .select({ rewatchedFileIds: 1, seasons: 1, watchedFileIds: 1 })
      .lean();

    for (const program of programs)
      await writeMediaProgramAttrs(String(program._id), {
        rewatchedFileIds: replaceId(program.rewatchedFileIds),
        // The file merged into takes the duplicate's episode number, even beside it in the season.
        seasons: readMediaProgramSeasons(program.seasons).map((season) => ({
          ...season,
          episodeNumbers: Object.fromEntries(
            Object.entries(normalizeSeasonEpisodes(season).episodeNumbers)
              .filter(([id]) => id !== replacementId || !season.fileIds.includes(fileId))
              .map(([id, number]) => [id === fileId ? replacementId : id, number]),
          ),
          fileIds: replaceId(season.fileIds),
        })),
        watchedFileIds: replaceId(program.watchedFileIds),
      });
  });

/* -------------------------------------------------------------------------- */
/*                                API ENDPOINTS                               */
/* -------------------------------------------------------------------------- */
/** Copies each collection's files into a new season; the collections are left as they are. */
export const copyCollectionsToMediaProgram = makeAction(
  async ({ collectionIds, id }: { collectionIds: string[]; id: string }) => {
    const isLinked = await withMetadataMutation(async () => {
      const program = await models.MediaProgramModel.findById(id)
        .select({ meta: 1, name: 1, seasons: 1 })
        .lean();

      if (!program) throw new Error("Media program not found");

      const collections = await models.FileCollectionModel.find({
        _id: { $in: objectIds(collectionIds) },
      })
        .select({ fileIdIndexes: 1, rating: 1, ratingIsManual: 1, title: 1 })
        .lean();

      const collectionsById = new Map(
        collections.map((collection) => [String(collection._id), collection]),
      );
      // Seasons imported as collections were titled after their program.
      const titlePrefix = `${program.name} - `;

      const copiedSeasons = collectionIds
        .map((collectionId) => collectionsById.get(collectionId))
        .filter(Boolean)
        .map((collection): MediaProgramSeason => {
          const label = collection.title.startsWith(titlePrefix)
            ? collection.title.slice(titlePrefix.length)
            : collection.title;

          return {
            // Episodes count up from 1 in the collection's order.
            episodeNumbers: {},
            fileIds: [...collection.fileIdIndexes]
              .sort((a, b) => a.index - b.index)
              .map(({ fileId }) => String(fileId)),
            id: randomUUID(),
            label,
            meta: null,
            number: parseSeasonNumber(label),
            rating: collection.ratingIsManual ? collection.rating : 0,
            ratingIsManual: !!collection.ratingIsManual,
          };
        });

      await writeMediaProgramAttrs(id, {
        seasons: [...readMediaProgramSeasons(program.seasons), ...copiedSeasons],
      });

      return !!program.meta;
    });

    if (isLinked) actions.queueMediaProgramMetaRefresh([id]);
  },
);

export const createMediaProgram = makeAction(async (args: Omit<MediaProgramUpdates, "seasons">) =>
  withMetadataMutation(async () => {
    const name = args.name?.trim();
    if (!name) throw new Error("A name is required");

    const dateCreated = dayjs().toISOString();
    const watchStatus = args.watchStatus ?? "unwatched";

    const program: Omit<models.MediaProgramSchema, "id"> = {
      dateCreated,
      dateModified: dateCreated,
      fileCount: 0,
      genreIds: args.genreIds ?? [],
      isRewatching: false,
      language: args.language,
      medium: args.medium,
      meta: null,
      name,
      rating: 0,
      rewatchCount: 0,
      rewatchedFileIds: [],
      seasons: [],
      size: 0,
      tagIds: [],
      tagIdsWithAncestors: [],
      type: args.type,
      watchedFileIds: [],
      watchStatus,
      watchStatusOrder: getWatchStatusOrder(watchStatus),
      year: args.year,
    };

    const res = await new models.MediaProgramModel(program).save(metadataSaveOptions());
    const id = res._id.toString();

    socket.emitVolatile("onMediaProgramCreated", { ...program, id });

    return leanModelToJson<models.MediaProgramSchema>(
      await models.MediaProgramModel.findById(id).lean(),
    );
  }),
);

/** Deletes the programs and their downloaded images; their episodes' files are kept. */
export const deleteMediaPrograms = makeAction(async ({ ids }: { ids: string[] }) => {
  const programs = await withMetadataMutation(async () => {
    const deleted = await models.MediaProgramModel.find({ _id: { $in: objectIds(ids) } })
      .select({ meta: 1, seasons: 1 })
      .lean();

    await models.MediaProgramModel.deleteMany(
      { _id: { $in: objectIds(ids) } },
      metadataWriteOptions(),
    );

    socket.emitVolatile("onMediaProgramDeleted", { ids });

    return deleted;
  });

  await removeMediaProgramImages(programs);
});

/** The IDs of every program the filters match, in the filters' sort order. */
export const listFilteredMediaProgramIds = makeAction(
  async (args: actions.CreateMediaProgramFilterPipelineInput) => {
    const { $match, $sort } = await actions.createMediaProgramFilterPipeline(args);

    const programs = await models.MediaProgramModel.find($match)
      .sort($sort)
      .select({ _id: 1 })
      .allowDiskUse(true)
      .lean();

    return programs.map((program) => String(program._id));
  },
);

/**
 * Existing programs for the given folders, with their last numbered season and the highest episode
 * number its files' names give, which loose episodes continue.
 */
export const listMediaProgramsBySourceFolders = makeAction(
  async ({ folderPaths }: { folderPaths: string[] }) => {
    const programs = await models.MediaProgramModel.find({
      sourceFolderKey: { $in: folderPaths.map(normalizeSourceFolderPath) },
    })
      .select({
        language: 1,
        medium: 1,
        name: 1,
        "seasons.fileIds": 1,
        "seasons.label": 1,
        "seasons.number": 1,
        sourceFolderKey: 1,
        type: 1,
        year: 1,
      })
      .lean();

    // Programs saved before they owned seasons have none.
    const lastSeasons = new Map(
      programs.map((program) => [
        program.sourceFolderKey,
        readMediaProgramSeasons(program.seasons).reduce<MediaProgramSeason>(
          (last, season) => (season.number > (last?.number ?? 0) ? season : last),
          null,
        ),
      ]),
    );

    const files = await models.FileModel.find({
      _id: { $in: objectIds([...lastSeasons.values()].flatMap((season) => season?.fileIds ?? [])) },
    })
      .select({ originalName: 1 })
      .lean();

    const fileNames = new Map(files.map((file) => [String(file._id), file.originalName]));
    const programsByKey = new Map(programs.map((program) => [program.sourceFolderKey, program]));

    return folderPaths
      .map((folderPath) => ({
        folderPath,
        program: programsByKey.get(normalizeSourceFolderPath(folderPath)),
      }))
      .filter(({ program }) => program)
      .map(({ folderPath, program }) => {
        const lastSeason = lastSeasons.get(program.sourceFolderKey);

        return {
          folderPath,
          id: String(program._id),
          language: program.language,
          lastSeason: lastSeason
            ? {
                episodeNumber: getLastEpisodeNumber(
                  lastSeason.fileIds.map((fileId) => fileNames.get(fileId)).filter(Boolean),
                ),
                label: lastSeason.label,
                number: lastSeason.number,
              }
            : null,
          medium: program.medium,
          name: program.name,
          type: program.type,
          year: program.year,
        };
      });
  },
);

/** Marks a played file watched in every program whose seasons contain it. */
export const markFileWatched = makeAction(async ({ fileId }: { fileId: string }) => {
  const programFilter = { "seasons.fileIds": fileId };

  // Most played files belong to no program, so they never wait for the metadata queue.
  if (!(await models.MediaProgramModel.exists(programFilter))) return [];

  return withMetadataMutation(async () => {
    const programs = await models.MediaProgramModel.find(programFilter).lean();

    for (const program of programs) await writeWatchedFileIds(program, [fileId], true);

    return programs.map((program) => String(program._id));
  });
});

export const regenMediaProgramAttrs = makeAction(async ({ ids }: { ids: string[] }) =>
  withMetadataMutation(async () => {
    for (const id of ids) await writeMediaProgramAttrs(id);
  }),
);

export const setMediaProgramEpisodesWatched = makeAction(
  async (args: { fileIds: string[]; id: string; isWatched: boolean }) =>
    withMetadataMutation(async () => {
      const program = await models.MediaProgramModel.findById(args.id).lean();
      if (!program) throw new Error("Media program not found");

      return writeWatchedFileIds(program, args.fileIds, args.isWatched);
    }),
);

export const updateMediaProgram = makeAction(
  async ({
    expectedSeasons,
    id,
    updates,
  }: {
    /** The seasons a season edit was made from, which must still be the saved ones. */
    expectedSeasons?: MediaProgramSeasonOutline[];
    id: string;
    updates: MediaProgramUpdates;
  }) => {
    const { needsMetaRefresh, program } = await withMetadataMutation(async () => {
      const saved = await models.MediaProgramModel.findById(id).lean();
      if (!saved) throw new Error("Media program not found");

      const savedSeasons = readMediaProgramSeasons(saved.seasons);

      if (updates.name !== undefined && !updates.name.trim()) throw new Error("A name is required");

      // A rewatch counts a finished viewing again, so it starts from a watched program.
      if (updates.isRewatching && !saved.isRewatching && saved.watchStatus !== "watched")
        throw new Error("Only watched programs can be rewatched");

      // Saving seasons edited from an outdated copy would undo changes made since, such as imports.
      if (
        expectedSeasons &&
        !isDeepEqual(getMediaProgramSeasonOutlines(savedSeasons), expectedSeasons)
      )
        throw new Error(
          "This program's seasons changed elsewhere. Try again with the latest ones.",
        );

      const { seasons, ...fields } = updates;
      const newSeasons = seasons ? normalizeSeasons(seasons, savedSeasons) : null;

      const changes: Partial<models.MediaProgramSchema> = {
        ...fields,
        dateModified: dayjs().toISOString(),
        ...(fields.name !== undefined ? { name: fields.name.trim() } : {}),
        // Starting or stopping a rewatch begins its episode marks anew.
        ...(fields.isRewatching !== undefined && fields.isRewatching !== saved.isRewatching
          ? { rewatchedFileIds: [] }
          : {}),
        ...(fields.watchStatus
          ? { watchStatusOrder: getWatchStatusOrder(fields.watchStatus) }
          : {}),
      };

      await models.MediaProgramModel.updateOne(
        { _id: id },
        { $set: changes },
        metadataWriteOptions(),
      );

      socket.emitVolatile("onMediaProgramUpdated", { id, updates: changes });

      // Changed seasons rederive the program, and clearing its rating returns it to their average.
      if (newSeasons) await writeMediaProgramAttrs(id, { seasons: newSeasons });
      else if (fields.ratingIsManual === false) await writeMediaProgramAttrs(id);

      // Setting a program watched marks every episode, like marking all of its seasons watched,
      // and those without files as watched elsewhere, unless skipped.
      if (fields.watchStatus === "watched") {
        const latest = await models.MediaProgramModel.findById(id).lean();
        const latestSeasons = readMediaProgramSeasons(latest.seasons);
        const episodeIds = getMediaProgramEpisodeIds(latestSeasons);
        const missingMarks: MediaProgramMissingMarks = {
          ...Object.fromEntries(
            getMediaProgramMissingEpisodes(latest.meta, latestSeasons).flatMap((season) =>
              season.episodes.map((episode) => [
                getMissingEpisodeKey(season.number, episode.number),
                "watched",
              ]),
            ),
          ),
          ...latest.missingMarks,
        };

        if (!isDeepEqual(missingMarks, latest.missingMarks ?? {})) {
          await models.MediaProgramModel.updateOne(
            { _id: id },
            { $set: { missingMarks } },
            metadataWriteOptions(),
          );

          socket.emitVolatile("onMediaProgramUpdated", { id, updates: { missingMarks } });
        }

        if (episodeIds.length)
          await writeWatchedFileIds({ ...latest, missingMarks }, episodeIds, true);
      } else if (fields.missingMarks && !fields.watchStatus) {
        // Marks watched elsewhere on episodes without files finish or reopen the program like
        // marks on its files. Skips mark nothing, so they only finish it, and unchanged marks
        // leave its status alone.
        const savedMarks = saved.missingMarks ?? {};
        const changedKeys = [
          ...new Set([...Object.keys(savedMarks), ...Object.keys(fields.missingMarks)]),
        ].filter((key) => savedMarks[key] !== fields.missingMarks[key]);

        if (changedKeys.length) {
          const latest = await models.MediaProgramModel.findById(id).lean();
          const isMarked = changedKeys.some((key) => fields.missingMarks[key] === "watched");
          const isUnmarked = changedKeys.some((key) => savedMarks[key] === "watched");

          await writeWatchedFileIds(
            latest,
            [],
            !isUnmarked && (isMarked || ["watched", "watching"].includes(latest.watchStatus)),
          );
        }
      }

      return {
        needsMetaRefresh:
          !!saved.meta && !!newSeasons && getNeedsMetaRefresh(savedSeasons, newSeasons),
        program: leanModelToJson<models.MediaProgramSchema>(
          await models.MediaProgramModel.findById(id).lean(),
        ),
      };
    });

    if (needsMetaRefresh) actions.queueMediaProgramMetaRefresh([id]);

    return program;
  },
);
