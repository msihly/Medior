import path from "path";
import * as models from "medior/_generated/server/models";
import * as actions from "medior/server/database/actions";
import { normalizeSourceFolderPath } from "medior/server/database/actions/collections";
import { withMetadataMutation } from "medior/server/database/metadata-mutations";
import { metadataWriteOptions } from "medior/server/database/metadata-work";
import {
  dayjs,
  isDeepEqual,
  MediaProgramImport,
  MediaProgramWatchStatus,
  parseMediaProgramName,
} from "medior/utils/common";
import { leanModelToJson, makeAction, objectId, objectIds, socket } from "medior/utils/server";

type CollectionIdIndex = models.MediaProgramSchema["collectionIdIndexes"][number];

type MediaProgramUpdates = Partial<
  Pick<
    models.MediaProgramSchema,
    | "collectionIdIndexes"
    | "genreIds"
    | "isRewatching"
    | "language"
    | "medium"
    | "name"
    | "rating"
    | "ratingIsManual"
    | "type"
    | "watchStatus"
    | "year"
  >
>;

/* -------------------------------------------------------------------------- */
/*                              HELPER FUNCTIONS                              */
/* -------------------------------------------------------------------------- */
const getWatchStatus = (
  current: MediaProgramWatchStatus,
  {
    isComplete,
    isWatched,
    markedCount,
  }: { isComplete: boolean; isWatched: boolean; markedCount: number },
): MediaProgramWatchStatus => {
  if (isComplete) return "watched";
  else if (!markedCount && ["watched", "watching"].includes(current)) return "unwatched";
  // A program set to Watched stays so while episodes are replayed; unmarking one reopens it.
  else if (current === "watched") return isWatched ? "watched" : "watching";
  else if (markedCount && isWatched) return "watching";
  else return current;
};

const normalizeCollectionIdIndexes = (collectionIdIndexes: CollectionIdIndex[]) => {
  const seenIds = new Set<string>();

  return [...collectionIdIndexes]
    .sort((a, b) => a.index - b.index)
    .filter(({ collectionId }) => {
      const id = String(collectionId);
      if (seenIds.has(id)) return false;

      seenIds.add(id);
      return true;
    })
    .map(({ collectionId }, index) => ({ collectionId: String(collectionId), index }));
};

/** The derived program fields in a comparable form, with ids as strings. */
const readMediaProgramAttrs = (
  program: Pick<
    models.MediaProgramSchema,
    | "collectionIdIndexes"
    | "fileCount"
    | "posterFileId"
    | "rating"
    | "rewatchedFileIds"
    | "size"
    | "tagIds"
    | "watchedFileIds"
  >,
) => ({
  collectionIdIndexes: program.collectionIdIndexes.map(({ collectionId, index }) => ({
    collectionId: String(collectionId),
    index,
  })),
  fileCount: program.fileCount,
  posterFileId: program.posterFileId ? String(program.posterFileId) : null,
  rating: program.rating,
  rewatchedFileIds: program.rewatchedFileIds.map(String),
  size: program.size,
  tagIds: program.tagIds.map(String),
  watchedFileIds: program.watchedFileIds.map(String),
});

/** Episodes in season order, then file order; a file in several seasons counts once. */
const readMediaProgramSeasons = async (
  program: Pick<models.MediaProgramSchema, "collectionIdIndexes">,
) => {
  const collectionIds = [...program.collectionIdIndexes]
    .sort((a, b) => a.index - b.index)
    .map(({ collectionId }) => String(collectionId));

  const collections = await models.FileCollectionModel.find({
    _id: { $in: objectIds(collectionIds) },
  })
    .select({ fileIdIndexes: 1, rating: 1, tagIds: 1 })
    .lean();

  const collectionsById = new Map(
    collections.map((collection) => [String(collection._id), collection]),
  );
  const seasons = collectionIds.map((id) => collectionsById.get(id)).filter(Boolean);

  const episodeIds = [
    ...new Set(
      seasons.flatMap((season) =>
        [...season.fileIdIndexes]
          .sort((a, b) => a.index - b.index)
          .map(({ fileId }) => String(fileId)),
      ),
    ),
  ];

  return { episodeIds, seasons };
};

/**
 * Derives episode counts, size, rating, tags, and poster from the seasons, saving only changes.
 * After seasons were added or removed outside an edit, the seasons are sent to open windows too.
 */
const writeMediaProgramAttrs = async (id: string, { isSeasonChange = false } = {}) => {
  const program = await models.MediaProgramModel.findById(id)
    .select({
      collectionIdIndexes: 1,
      fileCount: 1,
      isRewatching: 1,
      posterFileId: 1,
      rating: 1,
      ratingIsManual: 1,
      rewatchedFileIds: 1,
      size: 1,
      tagIds: 1,
      watchedFileIds: 1,
      watchStatus: 1,
    })
    .lean();

  if (!program) return;

  const { episodeIds, seasons } = await readMediaProgramSeasons(program);
  const current = readMediaProgramAttrs(program);
  const episodeIdSet = new Set(episodeIds);
  const ratedSeasons = seasons.filter((season) => season.rating > 0);
  const seasonIds = new Set(seasons.map((season) => String(season._id)));

  // A file in several seasons counts once, as it does in the episode count.
  const [episodeSize] = await models.FileModel.aggregate<{ size: number }>([
    { $match: { _id: { $in: objectIds(episodeIds) } } },
    { $group: { _id: null, size: { $sum: "$size" } } },
  ]);

  const attrs = readMediaProgramAttrs({
    collectionIdIndexes: program.collectionIdIndexes.filter(({ collectionId }) =>
      seasonIds.has(String(collectionId)),
    ),
    fileCount: episodeIds.length,
    posterFileId: episodeIds[0] ?? null,
    rating: program.ratingIsManual
      ? program.rating
      : ratedSeasons.length
        ? ratedSeasons.reduce((total, season) => total + season.rating, 0) / ratedSeasons.length
        : 0,
    rewatchedFileIds: current.rewatchedFileIds.filter((fileId) => episodeIdSet.has(fileId)),
    size: episodeSize?.size ?? 0,
    tagIds: [...new Set(seasons.flatMap((season) => season.tagIds.map(String)))].sort(),
    watchedFileIds: current.watchedFileIds.filter((fileId) => episodeIdSet.has(fileId)),
  });

  const updates: Partial<models.MediaProgramSchema> = Object.fromEntries(
    Object.entries(attrs).filter(([key, value]) => !isDeepEqual(current[key], value)),
  );

  if (updates.tagIds)
    updates.tagIdsWithAncestors = await actions.deriveAncestorTagIds(attrs.tagIds);

  if (isSeasonChange) updates.collectionIdIndexes = attrs.collectionIdIndexes;

  // The watch status follows episodes or marks that season changes added or removed, leaving a
  // status set by hand alone otherwise. A rewatch keeps its own.
  if (!program.isRewatching) {
    const watchedCount = attrs.watchedFileIds.length;
    const isComplete = attrs.fileCount > 0 && watchedCount === attrs.fileCount;

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
    else if (
      updates.watchedFileIds &&
      !watchedCount &&
      ["watched", "watching"].includes(program.watchStatus)
    )
      updates.watchStatus = "unwatched";
  }

  if (Object.keys(updates).length) {
    await models.MediaProgramModel.updateOne(
      { _id: id },
      { $set: updates },
      metadataWriteOptions(),
    );

    socket.emit("onMediaProgramUpdated", { id, updates });
  }
};

/** Marks apply to the rewatch when one is active; finishing a rewatch counts it and clears its marks. */
const writeWatchedFileIds = async (
  program: models.MediaProgramSchema & { _id: unknown },
  fileIds: string[],
  isWatched: boolean,
) => {
  const id = String(program._id);
  const { episodeIds } = await readMediaProgramSeasons(program);
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
  const isComplete = episodeIds.length > 0 && markedIds.length === episodeIds.length;
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
            markedCount: markedIds.length,
          }),
        }),
  };

  await models.MediaProgramModel.updateOne({ _id: id }, { $set: updates }, metadataWriteOptions());

  socket.emit("onMediaProgramUpdated", { id, updates });

  return updates;
};

// @generator-ignore-export
export const attachImportedMediaProgramSeason = (args: {
  collectionId: string;
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
          collectionIdIndexes: [],
          dateCreated: dateModified,
          fileCount: 0,
          genreIds: [],
          isRewatching: false,
          rating: 0,
          rewatchCount: 0,
          rewatchedFileIds: [],
          size: 0,
          sourceFolderPath: mediaProgram.sourceFolderPath,
          tagIds: [],
          tagIdsWithAncestors: [],
          watchedFileIds: [],
          watchStatus: "unwatched",
        },
      },
      { ...metadataWriteOptions(), new: true, upsert: true },
    ).lean();

    const program = leanModelToJson<models.MediaProgramSchema>(updated);

    if (!existing) socket.emit("onMediaProgramCreated", program);

    const isNewSeason = !program.collectionIdIndexes.some(
      ({ collectionId }) => String(collectionId) === args.collectionId,
    );
    const indexes = program.collectionIdIndexes.map(({ index }) => index);

    // Imports scanned before an earlier one finished planned the same position; later ones follow.
    if (isNewSeason)
      await models.MediaProgramModel.updateOne(
        { _id: program.id },
        {
          $push: {
            collectionIdIndexes: {
              collectionId: objectId(args.collectionId),
              index: indexes.includes(mediaProgram.seasonIndex)
                ? Math.max(...indexes) + 1
                : mediaProgram.seasonIndex,
            },
          },
        },
        metadataWriteOptions(),
      );

    await writeMediaProgramAttrs(program.id, { isSeasonChange: isNewSeason });
  });

// @generator-ignore-export
export const regenMediaProgramsByCollectionIds = (collectionIds: string[]) =>
  withMetadataMutation(async () => {
    if (!collectionIds.length) return;

    const programs = await models.MediaProgramModel.find({
      "collectionIdIndexes.collectionId": { $in: objectIds(collectionIds) },
    })
      .select({ _id: 1 })
      .lean();

    for (const program of programs) await writeMediaProgramAttrs(String(program._id));
  });

// @generator-ignore-export
export const removeMediaProgramCollectionIds = (collectionIds: string[]) =>
  withMetadataMutation(async () => {
    const ids = objectIds(collectionIds);

    const programs = await models.MediaProgramModel.find({
      "collectionIdIndexes.collectionId": { $in: ids },
    })
      .select({ _id: 1 })
      .lean();

    if (!programs.length) return;

    await models.MediaProgramModel.updateMany(
      { _id: { $in: programs.map((program) => program._id) } },
      { $pull: { collectionIdIndexes: { collectionId: { $in: ids } } } },
      metadataWriteOptions(),
    );

    for (const program of programs)
      await writeMediaProgramAttrs(String(program._id), { isSeasonChange: true });
  });

/**
 * Points programs' seasons at the collection they were merged into, keeping each program's first
 * position for it.
 */
// @generator-ignore-export
export const replaceMediaProgramCollectionIds = (collectionIds: string[], targetId: string) =>
  withMetadataMutation(async () => {
    const replacedIds = new Set(collectionIds);

    const programs = await models.MediaProgramModel.find({
      "collectionIdIndexes.collectionId": { $in: objectIds(collectionIds) },
    })
      .select({ collectionIdIndexes: 1 })
      .lean();

    for (const program of programs) {
      const collectionIdIndexes = normalizeCollectionIdIndexes(
        program.collectionIdIndexes.map(({ collectionId, index }) => ({
          collectionId: replacedIds.has(String(collectionId)) ? targetId : String(collectionId),
          index,
        })),
      );

      await models.MediaProgramModel.updateOne(
        { _id: program._id },
        { $set: { collectionIdIndexes } },
        metadataWriteOptions(),
      );

      await writeMediaProgramAttrs(String(program._id), { isSeasonChange: true });
    }
  });

/* -------------------------------------------------------------------------- */
/*                                API ENDPOINTS                               */
/* -------------------------------------------------------------------------- */
export const createMediaProgram = makeAction(
  async (args: Omit<MediaProgramUpdates, "collectionIdIndexes"> & { collectionIds?: string[] }) =>
    withMetadataMutation(async () => {
      const name = args.name?.trim();
      if (!name) throw new Error("A name is required");

      const dateCreated = dayjs().toISOString();

      const program: Omit<models.MediaProgramSchema, "id"> = {
        collectionIdIndexes: (args.collectionIds ?? []).map((collectionId, index) => ({
          collectionId,
          index,
        })),
        dateCreated,
        dateModified: dateCreated,
        fileCount: 0,
        genreIds: args.genreIds ?? [],
        isRewatching: false,
        language: args.language,
        medium: args.medium,
        name,
        rating: 0,
        rewatchCount: 0,
        rewatchedFileIds: [],
        size: 0,
        tagIds: [],
        tagIdsWithAncestors: [],
        type: args.type,
        watchedFileIds: [],
        watchStatus: args.watchStatus ?? "unwatched",
        year: args.year,
      };

      const res = await new models.MediaProgramModel(program).save(metadataWriteOptions());
      const id = res._id.toString();

      socket.emit("onMediaProgramCreated", { ...program, id });

      await writeMediaProgramAttrs(id);

      return leanModelToJson<models.MediaProgramSchema>(
        await models.MediaProgramModel.findById(id).lean(),
      );
    }),
);

export const deleteMediaPrograms = makeAction(
  async ({ ids, withCollections = false }: { ids: string[]; withCollections?: boolean }) => {
    const collectionIds = await withMetadataMutation(async () => {
      const programs = await models.MediaProgramModel.find({ _id: { $in: objectIds(ids) } })
        .select({ collectionIdIndexes: 1 })
        .lean();

      await models.MediaProgramModel.deleteMany(
        { _id: { $in: objectIds(ids) } },
        metadataWriteOptions(),
      );

      socket.emit("onMediaProgramDeleted", { ids });

      return programs.flatMap((program) =>
        program.collectionIdIndexes.map(({ collectionId }) => String(collectionId)),
      );
    });

    if (withCollections && collectionIds.length) {
      const res = await actions.deleteCollections({ ids: [...new Set(collectionIds)] });

      if (!res.success) throw new Error(res.error);
    }
  },
);

/** Existing programs for the given folders, with the next free season index for new seasons. */
export const listMediaProgramsBySourceFolders = makeAction(
  async ({ folderPaths }: { folderPaths: string[] }) => {
    const programs = await models.MediaProgramModel.find({
      sourceFolderKey: { $in: folderPaths.map(normalizeSourceFolderPath) },
    })
      .select({
        collectionIdIndexes: 1,
        language: 1,
        medium: 1,
        name: 1,
        sourceFolderKey: 1,
        type: 1,
        year: 1,
      })
      .lean();

    const programsByKey = new Map(programs.map((program) => [program.sourceFolderKey, program]));

    return folderPaths
      .map((folderPath) => ({
        folderPath,
        program: programsByKey.get(normalizeSourceFolderPath(folderPath)),
      }))
      .filter(({ program }) => program)
      .map(({ folderPath, program }) => ({
        folderPath,
        id: String(program._id),
        language: program.language,
        medium: program.medium,
        name: program.name,
        nextSeasonIndex: Math.max(-1, ...program.collectionIdIndexes.map(({ index }) => index)) + 1,
        type: program.type,
        year: program.year,
      }));
  },
);

/** Marks a played file watched in every program whose seasons contain it. */
export const markFileWatched = makeAction(async ({ fileId }: { fileId: string }) => {
  // Most played files belong to no program, so they never wait for the metadata queue.
  const file = await models.FileModel.findById(fileId).select({ collectionIds: 1 }).lean();
  if (!file?.collectionIds?.length) return [];

  const programFilter = { "collectionIdIndexes.collectionId": { $in: file.collectionIds } };
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
  async ({ id, updates }: { id: string; updates: MediaProgramUpdates }) =>
    withMetadataMutation(async () => {
      const program = await models.MediaProgramModel.findById(id).lean();
      if (!program) throw new Error("Media program not found");

      if (updates.name !== undefined && !updates.name.trim()) throw new Error("A name is required");

      // A rewatch counts a finished viewing again, so it starts from a watched program.
      if (updates.isRewatching && !program.isRewatching && program.watchStatus !== "watched")
        throw new Error("Only watched programs can be rewatched");

      const changes: Partial<models.MediaProgramSchema> = {
        ...updates,
        dateModified: dayjs().toISOString(),
        ...(updates.name !== undefined ? { name: updates.name.trim() } : {}),
        ...(updates.collectionIdIndexes
          ? { collectionIdIndexes: normalizeCollectionIdIndexes(updates.collectionIdIndexes) }
          : {}),
        // Starting or stopping a rewatch begins its episode marks anew.
        ...(updates.isRewatching !== undefined && updates.isRewatching !== program.isRewatching
          ? { rewatchedFileIds: [] }
          : {}),
      };

      await models.MediaProgramModel.updateOne(
        { _id: id },
        { $set: changes },
        metadataWriteOptions(),
      );

      socket.emit("onMediaProgramUpdated", { id, updates: changes });

      // Clearing a rating returns it to the seasons' average.
      if (updates.collectionIdIndexes || updates.ratingIsManual === false)
        await writeMediaProgramAttrs(id);

      return leanModelToJson<models.MediaProgramSchema>(
        await models.MediaProgramModel.findById(id).lean(),
      );
    }),
);
