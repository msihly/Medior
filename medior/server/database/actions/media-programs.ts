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
  MediaProgramOption,
  MediaProgramPlan,
  MediaProgramSeason,
  MediaProgramSeasonInput,
  MediaProgramSeasonOutline,
  MediaProgramWatchStatus,
  mergeSeasonEpisodes,
  normalizeSeasonEpisodes,
  parseMediaProgramName,
  parseProgramSeasonNumber,
  parseSeasonNumber,
  sumArray,
} from "medior/utils/common";
import { getConfig, leanModelToJson, makeAction, objectIds, socket } from "medior/utils/server";
import { FileContinuePoint, readPotPlayerContinuePoint } from "medior/utils/server/pot-player";

type MediaProgramAttrs = ReturnType<typeof readMediaProgramAttrs>;

type MediaProgramSummary = Pick<
  models.MediaProgramSchema,
  "dateCreated" | "isKeptApart" | "language" | "medium" | "meta" | "name" | "type" | "year"
> & { _id: unknown };

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

/** The fields that tell programs apart, with only which metadata entry each is linked to. */
const MEDIA_PROGRAM_SUMMARY_SELECT = {
  dateCreated: 1,
  isKeptApart: 1,
  language: 1,
  medium: 1,
  "meta.source": 1,
  "meta.sourceId": 1,
  name: 1,
  otherSourceFolderKeys: 1,
  type: 1,
  year: 1,
};

/* -------------------------------------------------------------------------- */
/*                              HELPER FUNCTIONS                              */
/* -------------------------------------------------------------------------- */
/**
 * Orders programs most complete first: those with metadata, then those with more of a type,
 * medium, and language, then the oldest.
 */
const compareCompleteness = (a: MediaProgramSummary, b: MediaProgramSummary) => {
  const countDetails = (program: MediaProgramSummary) =>
    [program.type, program.medium, program.language].filter(Boolean).length;

  return (
    Number(!!b.meta) - Number(!!a.meta) ||
    countDetails(b) - countDetails(a) ||
    (a.dateCreated ?? "").localeCompare(b.dateCreated ?? "")
  );
};

/** The season matching another by its number, or else by its label. */
const findMatchingSeason = (
  seasons: MediaProgramSeason[],
  { label, number }: Pick<MediaProgramSeason, "label" | "number">,
) =>
  seasons.find((season) => number !== null && season.number === number) ??
  seasons.find((season) => season.label.toLowerCase() === label.toLowerCase());

/**
 * The one program the details name, in the same year when both have one. Several such programs
 * match none, leaving the import to create its own. Programs kept apart match none.
 */
const findNamedProgram = <T extends MediaProgramSummary>(
  programs: T[],
  { name, year }: { name: string; year?: number | null },
) => {
  const key = getNameKey(name);
  const matches = key
    ? programs.filter(
        (program) =>
          !program.isKeptApart &&
          getNameKey(program.name) === key &&
          (!year || !program.year || program.year === year),
      )
    : [];

  return matches.length === 1 ? matches[0] : null;
};

/** Programs by any folder they came from: their own, or one they took in. */
// @generator-ignore-export
export const getMediaProgramFolderFilter = (folderKeys: string[]) => ({
  $or: [{ sourceFolderKey: { $in: folderKeys } }, { otherSourceFolderKeys: { $in: folderKeys } }],
});

/**
 * A program's name without case or punctuation, so names written differently still match. Accents
 * and other marks stay, composed alike however they were typed.
 */
const getNameKey = (name: string) =>
  (name ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, "");

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

/**
 * Programs that duplicate one another: those with the same name and year, unless they're linked to
 * different metadata entries, which makes them different programs named alike. Programs kept apart
 * duplicate none.
 */
const groupDuplicatePrograms = <T extends MediaProgramSummary>(programs: T[]) => {
  const groups = new Map<string, T[]>();

  for (const program of programs) {
    const nameKey = getNameKey(program.name);
    const groupKey = `${nameKey}:${program.year ?? ""}`;

    if (nameKey && !program.isKeptApart)
      groups.set(groupKey, [...(groups.get(groupKey) ?? []), program]);
  }

  return [...groups.values()].filter((group) => {
    const metaEntries = new Set(
      group.filter(({ meta }) => meta).map(({ meta }) => `${meta.source}:${meta.sourceId}`),
    );

    return group.length > 1 && metaEntries.size <= 1;
  });
};

/** Adds a season after the last one numbered before it, keeping the program's own order. */
const insertSeason = (seasons: MediaProgramSeason[], season: MediaProgramSeason) => {
  const sortKey = getSeasonSortKey(season.number);
  const index = seasons.findLastIndex(({ number }) => getSeasonSortKey(number) <= sortKey);

  seasons.splice(index + 1, 0, season);
};

/**
 * Merges the programs into the most complete one, which keeps its details and takes those it lacks
 * from the others. Seasons matching by number, or else by label, combine their episodes, and the
 * others are added in order without their metadata, which a refresh downloads again. A file stays
 * in the first season that has it. Watch and rewatch marks, genres, folders, marks on episodes
 * without files of the same metadata entry, and title translations are combined, ratings set by
 * hand are kept, and ranked orders put the kept program at the best place any of them had. The
 * merged programs are then deleted. Resolves to the kept program's ID, or null when fewer than two
 * programs were found.
 */
const mergePrograms = async (ids: string[]) => {
  const merged = await withMetadataMutation(async () => {
    const programs = (
      await models.MediaProgramModel.find({ _id: { $in: objectIds(ids) } }).lean()
    ).sort(compareCompleteness);
    if (programs.length < 2) return null;

    const [target, ...sources] = programs;
    const id = String(target._id);
    const sourceIds = sources.map((source) => String(source._id));
    const sourceIdSet = new Set(sourceIds);
    const seasons = readMediaProgramSeasons(target.seasons);
    const episodeIds = new Set(getMediaProgramEpisodeIds(seasons));

    for (const programSeason of sources.flatMap((source) =>
      readMediaProgramSeasons(source.seasons),
    )) {
      const season = {
        ...programSeason,
        fileIds: programSeason.fileIds.filter((fileId) => !episodeIds.has(fileId)),
      };
      const match = findMatchingSeason(seasons, season);

      if (match) {
        Object.assign(match, mergeSeasonEpisodes(match, season));

        if (!match.ratingIsManual && season.ratingIsManual)
          Object.assign(match, { rating: season.rating, ratingIsManual: true });

        // Its own metadata match comes along, loading on the refresh that follows.
        if (!match.metaMatch && season.metaMatch)
          Object.assign(match, { meta: null, metaMatch: season.metaMatch });
      } else if (season.fileIds.length || !programSeason.fileIds.length)
        insertSeason(seasons, { ...season, meta: null });

      for (const fileId of season.fileIds) episodeIds.add(fileId);
    }

    const getFirst = <K extends "language" | "medium" | "type" | "year">(key: K) =>
      programs.find((program) => program[key])?.[key] ?? null;
    const lastWatched = programs
      .filter((program) => program.dateLastWatched && program.lastWatchedFileId)
      .sort((a, b) => b.dateLastWatched.localeCompare(a.dateLastWatched))[0];
    const manualRating = programs.find((program) => program.ratingIsManual);
    // Marks on episodes without files follow their metadata's numbering.
    const markedPrograms = programs.filter(
      (program) =>
        program.meta?.source === target.meta?.source &&
        program.meta?.sourceId === target.meta?.sourceId,
    );
    const rewatching = programs.filter((program) => program.isRewatching);
    // The kept program's own marks and translations win over the others'.
    const titleTranslations = new Map(
      programs
        .flatMap((program) => program.titleTranslations ?? [])
        .reverse()
        .map((translation) => [`${translation.language}:${translation.title}`, translation]),
    );
    const watchStatus =
      programs.find((program) => program.watchStatus !== "unwatched")?.watchStatus ?? "unwatched";

    const updates: Partial<models.MediaProgramSchema> = {
      dateCreated: programs.map((program) => program.dateCreated).sort()[0],
      dateModified: dayjs().toISOString(),
      genreIds: [...new Set(programs.flatMap((program) => program.genreIds.map(String)))],
      isRewatching: rewatching.length > 0,
      language: getFirst("language"),
      medium: getFirst("medium"),
      missingMarks: Object.assign(
        {},
        ...[...markedPrograms].reverse().map((program) => program.missingMarks ?? {}),
      ),
      otherSourceFolderKeys: [
        ...new Set(
          programs.flatMap((program) => [
            program.sourceFolderKey,
            ...(program.otherSourceFolderKeys ?? []),
          ]),
        ),
      ].filter((key) => key && key !== target.sourceFolderKey),
      rewatchCount: Math.max(...programs.map((program) => program.rewatchCount ?? 0)),
      titleTranslations: [...titleTranslations.values()],
      type: getFirst("type"),
      watchStatus,
      watchStatusOrder: getWatchStatusOrder(watchStatus),
      year: getFirst("year"),
      ...(lastWatched
        ? {
            dateLastWatched: lastWatched.dateLastWatched,
            lastWatchedFileId: String(lastWatched.lastWatchedFileId),
          }
        : {}),
      ...(manualRating ? { rating: manualRating.rating, ratingIsManual: true } : {}),
      // A program without metadata goes on waiting for the match any of them was waiting for.
      ...(target.meta ? {} : { isMetaPending: programs.some((program) => program.isMetaPending) }),
    };

    await models.MediaProgramModel.updateOne(
      { _id: id },
      { $set: updates },
      metadataWriteOptions(),
    );

    socket.emitVolatile("onMediaProgramUpdated", { id, updates });

    await writeMediaProgramAttrs(id, {
      rewatchedFileIds: [
        ...new Set(rewatching.flatMap((program) => program.rewatchedFileIds.map(String))),
      ],
      seasons,
      watchedFileIds: [
        ...new Set(programs.flatMap((program) => program.watchedFileIds.map(String))),
      ],
    });

    const savedSearches = await models.SavedSearchModel.find({ customOrderIds: { $in: sourceIds } })
      .select({ customOrderIds: 1 })
      .lean();

    for (const savedSearch of savedSearches) {
      const customOrderIds = [
        ...new Set(
          savedSearch.customOrderIds.map((orderId) => (sourceIdSet.has(orderId) ? id : orderId)),
        ),
      ];

      await models.SavedSearchModel.updateOne(
        { _id: savedSearch._id },
        { $set: { customOrderIds } },
        metadataWriteOptions(),
      );

      socket.emitVolatile("onSavedSearchUpdated", {
        id: String(savedSearch._id),
        updates: { customOrderIds },
      });
    }

    await models.MediaProgramModel.deleteMany(
      { _id: { $in: objectIds(sourceIds) } },
      metadataWriteOptions(),
    );

    socket.emitVolatile("onMediaProgramDeleted", { ids: sourceIds });

    return {
      deleted: sources,
      id,
      needsMeta:
        !!target.meta || !!updates.isMetaPending || seasons.some((season) => season.metaMatch),
    };
  });

  if (!merged) return null;

  await removeMediaProgramImages(merged.deleted);

  // The seasons it took in get their metadata again, as does a match still waiting.
  if (merged.needsMeta) actions.queueMediaProgramMetaRefresh([merged.id]);

  return merged.id;
};

/** Merges the program with any it duplicates, resolving to the one kept. */
const mergeProgramDuplicates = async (id: string) => {
  const programs = await models.MediaProgramModel.find()
    .select(MEDIA_PROGRAM_SUMMARY_SELECT)
    .lean();
  const group = groupDuplicatePrograms(programs).find((duplicates) =>
    duplicates.some((program) => String(program._id) === id),
  );

  return group ? ((await mergePrograms(group.map((program) => String(program._id)))) ?? id) : id;
};

/**
 * Seasons with unique IDs and episodes, keeping the saved metadata and own matches of seasons that
 * existed.
 */
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
      metaMatch: savedById.get(id)?.metaMatch ?? null,
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
    // A program whose every episode lacks a file finishes the same way as one with files.
    const isComplete =
      attrs.fileCount + missing.total > 0 &&
      watchedCount === attrs.fileCount &&
      missing.watched === missing.total;

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
    episodeIds.length + missing.total > 0 &&
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
 * Adds an import batch's files to its program's season: the program the folder belongs to, the one
 * the Import Editor matched or picked, or else one named alike in the same year, which the folder
 * then belongs to as well. Without one, the program is created, joining any it is one with by name
 * and year. Seasons are matched by number, then label. Resolves to the program's ID and whether
 * this import created it.
 */
// @generator-ignore-export
export const addImportedMediaProgramSeason = async (args: {
  fileIds: string[];
  mediaProgram: MediaProgramImport;
}) => {
  const imported = await withMetadataMutation(async () => {
    const { mediaProgram } = args;
    const dateModified = dayjs().toISOString();
    const sourceFolderKey = normalizeSourceFolderPath(mediaProgram.sourceFolderPath);
    const folderDetails = parseMediaProgramName(path.win32.basename(mediaProgram.sourceFolderPath));

    // Blank import fields leave an existing program's saved values in place.
    let fields = Object.fromEntries(
      Object.entries({
        language: mediaProgram.language,
        medium: mediaProgram.medium,
        name: mediaProgram.name?.trim(),
        type: mediaProgram.type,
        year: mediaProgram.year,
      }).filter(([, value]) => value !== null && value !== undefined && value !== ""),
    );

    const folderMatch = await models.MediaProgramModel.findOne(
      getMediaProgramFolderFilter([sourceFolderKey]),
    )
      .select({ _id: 1 })
      .lean();

    const pickedMatch =
      !folderMatch && mediaProgram.programId
        ? await models.MediaProgramModel.findById(mediaProgram.programId).select({ _id: 1 }).lean()
        : null;

    // A program chosen as new in the Import Editor joins none named alike.
    const nameMatch =
      folderMatch || pickedMatch || mediaProgram.isNew
        ? null
        : findNamedProgram(
            await models.MediaProgramModel.find().select(MEDIA_PROGRAM_SUMMARY_SELECT).lean(),
            { name: (fields.name as string) ?? folderDetails.name, year: fields.year as number },
          );

    const existing = folderMatch ?? pickedMatch ?? nameMatch;

    // A program found by name only takes the details it lacks.
    if (nameMatch)
      fields = Object.fromEntries(
        Object.entries(fields).filter(([key]) => !nameMatch[key as keyof MediaProgramSummary]),
      );

    // A program deleted after the scan is recreated under its folder's name.
    if (!existing && !fields.name) fields.name = folderDetails.name;

    const updated = existing
      ? await models.MediaProgramModel.findOneAndUpdate(
          { _id: existing._id },
          {
            $set: { dateModified, ...fields },
            // Imports from the folder find the program by it from now on.
            ...(folderMatch ? {} : { $addToSet: { otherSourceFolderKeys: sourceFolderKey } }),
          },
          { ...metadataWriteOptions(), returnDocument: "after" },
        ).lean()
      : await models.MediaProgramModel.findOneAndUpdate(
          { sourceFolderKey },
          {
            $set: { dateModified, ...fields },
            $setOnInsert: {
              dateCreated: dateModified,
              fileCount: 0,
              genreIds: [],
              // Chosen as new, it stays apart from programs named alike from now on.
              isKeptApart: !!mediaProgram.isNew,
              // Saved, so a match an import queues survives a restart until it's tried.
              // Programs imported while lookups are off wait for none, so turning them on
              // never matches them unasked.
              isMetaPending: getConfig().mediaPrograms.metaLookups,
              isRewatching: false,
              meta: null,
              otherSourceFolderKeys: [],
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
    const season = findMatchingSeason(seasons, { label: seasonLabel, number: seasonNumber });

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
    else
      insertSeason(seasons, {
        ...addSeasonEpisodes({ episodeNumbers: {}, fileIds: [] }, addedFiles),
        id: randomUUID(),
        label: seasonLabel,
        meta: null,
        metaMatch: null,
        number: seasonNumber,
        rating: 0,
        ratingIsManual: false,
      });

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

  if (!imported.isCreated || args.mediaProgram.isNew) return imported;

  // The import stands even when merging fails, leaving the duplicate to merge by hand.
  try {
    const id = await mergeProgramDuplicates(imported.id);
    return { id, isCreated: id === imported.id };
  } catch (error) {
    fileLog(`Failed to merge imported media program: ${error.message}`, { type: "error" });

    return imported;
  }
};

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
 * Merges, once, the duplicates among programs saved before imports matched programs by name: those
 * without a list of other folders, which each then gets. Programs made apart since, such as one
 * chosen as new in the Import Editor, are left as they are.
 */
// @generator-ignore-export
export const mergeDuplicateMediaPrograms = async () => {
  try {
    const programs = await models.MediaProgramModel.find()
      .select(MEDIA_PROGRAM_SUMMARY_SELECT)
      .lean();

    const groups = groupDuplicatePrograms(programs).filter((group) =>
      group.some((program) => !program.otherSourceFolderKeys),
    );
    // Programs whose merge failed are tried again on the next start.
    const failedIds: string[] = [];

    for (const group of groups) {
      const ids = group.map((program) => String(program._id));

      try {
        // Programs deleted since they were read leave nothing to merge.
        const id = await mergePrograms(ids);

        if (id)
          fileLog(`Merged ${group.length} media programs named "${group[0].name}" into ${id}`);
      } catch (error) {
        failedIds.push(...ids);
        fileLog(`Failed to merge media programs named "${group[0].name}": ${error.message}`, {
          type: "error",
        });
      }
    }

    await withMetadataMutation(() =>
      models.MediaProgramModel.updateMany(
        { _id: { $nin: objectIds(failedIds) }, otherSourceFolderKeys: { $exists: false } },
        { $set: { otherSourceFolderKeys: [] } },
        metadataWriteOptions(),
      ),
    );
  } catch (error) {
    fileLog(`Failed to merge duplicate media programs: ${error.message}`, { type: "error" });
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
      const programSeasons = readMediaProgramSeasons(program.seasons);

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
            metaMatch: null,
            number: parseSeasonNumber(label),
            rating: collection.ratingIsManual ? collection.rating : 0,
            ratingIsManual: !!collection.ratingIsManual,
          };
        });

      // A copied Movies season beside the program's TV seasons holds its extras like OVAs.
      const seasonNumbers = [...programSeasons, ...copiedSeasons].map(({ number }) => number);

      await writeMediaProgramAttrs(id, {
        seasons: [
          ...programSeasons,
          ...copiedSeasons.map((season) => ({
            ...season,
            number: parseProgramSeasonNumber(season.label, seasonNumbers),
          })),
        ],
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
      otherSourceFolderKeys: [],
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

/**
 * The files' continue points: the latest PotPlayer bookmark of each file that has one. Their
 * bookmark files are looked up in path order, so ones in the same folder are read together, and
 * one that can't be read is logged and left out.
 */
export const listFileContinuePoints = makeAction(async ({ fileIds }: { fileIds: string[] }) => {
  const files = await models.FileModel.find({ _id: { $in: objectIds(fileIds) } })
    .select({ duration: 1, path: 1 })
    .lean();

  const continuePoints: FileContinuePoint[] = [];

  for (const file of files.sort((a, b) => a.path.localeCompare(b.path))) {
    try {
      const bookmark = await readPotPlayerContinuePoint(file.path);

      if (bookmark)
        continuePoints.push({ ...bookmark, duration: file.duration, fileId: String(file._id) });
    } catch (error) {
      fileLog(`Failed to read the PotPlayer bookmarks of ${file.path}: ${error.message}`, {
        type: "error",
      });
    }
  }

  return continuePoints;
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

/** Every program's name and details, for choosing the one a folder is imported into. */
export const listMediaProgramOptions = makeAction(async () =>
  (
    await models.MediaProgramModel.find()
      .select({ language: 1, medium: 1, name: 1, type: 1, year: 1 })
      .sort({ name: 1, _id: 1 })
      .lean()
  ).map((program): MediaProgramOption => ({
    id: String(program._id),
    language: program.language ?? null,
    medium: program.medium ?? null,
    name: program.name,
    type: program.type ?? null,
    year: program.year ?? null,
  })),
);

/**
 * Existing programs for the given folders: the one each folder belongs to, or else one named
 * alike in the same year. Each comes with its last numbered season and the highest episode number
 * its files' names give, which loose episodes continue.
 */
export const listMediaProgramsBySourceFolders = makeAction(
  async ({ folders }: { folders: Pick<MediaProgramPlan, "folderPath" | "name" | "year">[] }) => {
    const folderKeys = folders.map(({ folderPath }) => normalizeSourceFolderPath(folderPath));

    const folderPrograms = await models.MediaProgramModel.find(
      getMediaProgramFolderFilter(folderKeys),
    )
      .select({ otherSourceFolderKeys: 1, sourceFolderKey: 1 })
      .lean();

    const programIdsByFolderKey = new Map(
      folderPrograms.flatMap((program) =>
        [program.sourceFolderKey, ...(program.otherSourceFolderKeys ?? [])]
          .filter(Boolean)
          .map((key): [string, string] => [key, String(program._id)]),
      ),
    );

    // Only folders no program came from are matched by name.
    const summaries = folderKeys.every((key) => programIdsByFolderKey.has(key))
      ? []
      : await models.MediaProgramModel.find().select(MEDIA_PROGRAM_SUMMARY_SELECT).lean();

    const matches = folders
      .map((folder, index) => {
        const folderProgramId = programIdsByFolderKey.get(folderKeys[index]);
        const namedProgram = folderProgramId ? null : findNamedProgram(summaries, folder);

        return {
          folderPath: folder.folderPath,
          id: folderProgramId ?? (namedProgram ? String(namedProgram._id) : null),
          isFolderMatch: !!folderProgramId,
        };
      })
      .filter(({ id }) => id);

    const programs = await models.MediaProgramModel.find({
      _id: { $in: objectIds(matches.map(({ id }) => id)) },
    })
      .select({
        language: 1,
        medium: 1,
        name: 1,
        "seasons.fileIds": 1,
        "seasons.label": 1,
        "seasons.number": 1,
        type: 1,
        year: 1,
      })
      .lean();

    const programsById = new Map(programs.map((program) => [String(program._id), program]));

    // Programs saved before they owned seasons have none.
    const lastSeasons = new Map(
      programs.map((program) => [
        String(program._id),
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

    return matches
      .filter(({ id }) => programsById.has(id))
      .map(({ folderPath, id, isFolderMatch }) => {
        const program = programsById.get(id);
        const lastSeason = lastSeasons.get(id);

        return {
          folderPath,
          id,
          isFolderMatch,
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

/** Merges the programs into the most complete one, resolving to its ID. */
export const mergeMediaPrograms = makeAction(async ({ ids }: { ids: string[] }) => {
  const id = await mergePrograms(ids);
  if (!id) throw new Error("Select at least two media programs to merge");

  return id;
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
