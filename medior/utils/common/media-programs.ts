import path from "path";
import type { CssColor } from "trabecula/utils/client";
import { dayjs, Fmt } from "trabecula/utils/common";

/** How episodes are labeled: by their number alone, or with their season's. */
export const MEDIA_PROGRAM_EPISODE_LABELS = [
  { label: "EP 104", value: "episode" },
  { label: "S05E03", value: "season" },
] as const;

export type MediaProgramEpisodeLabels = (typeof MEDIA_PROGRAM_EPISODE_LABELS)[number]["value"];

export const MEDIA_PROGRAM_META_SOURCES = [
  { label: "AniList", value: "anilist" },
  { label: "TVMaze", value: "tvmaze" },
] as const;

export type MediaProgramMetaSource = (typeof MEDIA_PROGRAM_META_SOURCES)[number]["value"];

/** Sources are searched in this order, each falling back to the next when it finds nothing. */
export const MEDIA_PROGRAM_META_SOURCE_ORDER: MediaProgramMetaSource[] = ["tvmaze", "anilist"];

export const MEDIA_PROGRAM_RANKING_ASPECT_RATIOS = [
  { label: "Poster (2:3)", value: "2:3" },
  { label: "Portrait (3:4)", value: "3:4" },
  { label: "Square (1:1)", value: "1:1" },
  { label: "Widescreen (16:9)", value: "16:9" },
] as const;

/** The whole-number ranges a ranking export's grid options must be within. */
export const MEDIA_PROGRAM_RANKING_LIMITS = {
  columns: { label: "Columns", max: 12, min: 1 },
  gap: { label: "Gap", max: 100, min: 0 },
  rows: { label: "Rows", max: 12, min: 1 },
  width: { label: "Width", max: 4096, min: 240 },
} as const;

export const MEDIA_PROGRAM_WATCH_STATUSES = [
  { label: "Unwatched", value: "unwatched" },
  { label: "Watching", value: "watching" },
  { label: "Watched", value: "watched" },
  { label: "Inactive", value: "inactive" },
  { label: "Dropped", value: "dropped" },
] as const;

export type MediaProgramWatchStatus = (typeof MEDIA_PROGRAM_WATCH_STATUSES)[number]["value"];

/** A status's place in viewing order, saved beside it so programs sort by it. */
export const getWatchStatusOrder = (watchStatus: MediaProgramWatchStatus) =>
  MEDIA_PROGRAM_WATCH_STATUSES.findIndex(({ value }) => value === watchStatus);

type MediaProgramDetails = Pick<MediaProgramPlan, "language" | "medium" | "name" | "type" | "year">;

/** An episode's details from the metadata source, shown for the episode at its number in the season. */
export interface MediaProgramEpisodeMeta {
  airDate: string | null;
  number: number;
  stillPath: string | null;
  title: string | null;
}

/**
 * Program details carried by each season's import batch until its files are added to the program.
 * Existing programs only receive the details edited in the Import Editor.
 */
export interface MediaProgramImport extends Partial<MediaProgramDetails> {
  /** The season's episodes are marked watched as they're added. */
  isWatched: boolean;
  seasonLabel: string;
  seasonNumber: number | null;
  sourceFolderPath: string;
  /** The season's title shown in the Import Manager. */
  title: string;
  /** A status set on the program, which otherwise follows its watched episodes. */
  watchStatus: MediaProgramWatchStatus | null;
}

/** The program's details from a public metadata source, with its images saved locally. */
export interface MediaProgramMeta {
  bannerPath: string | null;
  description: string | null;
  endDate: string | null;
  episodeCount: number | null;
  format: string | null;
  genres: string[];
  /** The studio of an anime or the network of a show. */
  network: string | null;
  posterPath: string | null;
  /** Out of 100. */
  score: number | null;
  /** Every season the source lists, including those the program has no files for. */
  seasons: MediaProgramMetaSeason[];
  source: MediaProgramMetaSource;
  sourceId: number;
  startDate: string | null;
  status: string | null;
  title: string;
  url: string | null;
}

/** A program's entry in a metadata source. */
export interface MediaProgramMetaMatch {
  source: MediaProgramMetaSource;
  sourceId: number;
}

/** A season the metadata source lists, with specials as season 0; its episodes have no stills. */
export interface MediaProgramMetaSeason {
  episodes: MediaProgramEpisodeMeta[];
  number: number;
  startDate: string | null;
  title: string | null;
}

/** An episode without a file watched elsewhere, or skipped. */
export type MediaProgramMissingMark = "skipped" | "watched";

/**
 * Marks on episodes without files, by their source season and episode numbers, which a missing
 * season's episodes have as well.
 */
export type MediaProgramMissingMarks = Record<string, MediaProgramMissingMark>;

/** A metadata search result offered when matching a program by hand. */
export interface MediaProgramMetaResult {
  description: string | null;
  format: string | null;
  posterUrl: string | null;
  source: MediaProgramMetaSource;
  sourceId: number;
  title: string;
  year: number | null;
}

/** A program detected by the Import Editor, edited before its seasons are imported. */
export interface MediaProgramPlan {
  existingId?: string;
  fileCount: number;
  folderPath: string;
  language: string;
  medium: string;
  name: string;
  /** Details of the existing program when it was scanned. */
  saved?: MediaProgramDetails;
  seasonLabels: string[];
  type: string;
  /**
   * Any status but Unwatched imports its season folders' episodes as watched, leaving loose
   * episodes unwatched. Watching, Inactive, and Dropped are then set on the program, while Watched
   * follows from its episodes, and Unwatched leaves an existing program's status alone.
   */
  watchStatus: MediaProgramWatchStatus;
  year: number | null;
}

/** The grid of top-ranked programs exported as one image. */
export interface MediaProgramRankingExport {
  aspectRatio: (typeof MEDIA_PROGRAM_RANKING_ASPECT_RATIOS)[number]["value"];
  columns: number;
  /** Pixels between tiles and around the grid. */
  gap: number;
  rows: number;
  showDetails: boolean;
  showName: boolean;
  showRank: boolean;
  showRating: boolean;
  showTitle: boolean;
  /** Pixels across the image. */
  width: number;
}

/** One program's tile in an exported ranking. */
export interface MediaProgramRankingTile {
  details: string;
  /** A still image, or a thumbnail whose frame size marks it as a grid of video frames. */
  image: { frameHeight?: number; frameWidth?: number; path: string } | null;
  name: string;
  rank: number;
  rating: { color: CssColor; text: string } | null;
}

/** A season the program owns, with its episodes in their custom order. */
export interface MediaProgramSeason {
  /** Each episode's number by its file, so episodes keep their numbers around gaps and moves. */
  episodeNumbers: Record<string, number>;
  fileIds: string[];
  id: string;
  label: string;
  meta: MediaProgramSeasonMeta | null;
  /** The season's number from its label, matching it to the metadata source's seasons. */
  number: number | null;
  /** The average of its rated episodes unless rated by hand. */
  rating: number;
  ratingIsManual: boolean;
}

/** A season as the editor sends it, which keeps its saved metadata; new seasons have no ID yet. */
export type MediaProgramSeasonInput = Omit<MediaProgramSeason, "id" | "meta"> & { id?: string };

/** A season's details from the metadata source. */
export interface MediaProgramSeasonMeta {
  /** Every episode the source lists; those numbered past the season's files are missing. */
  episodes: MediaProgramEpisodeMeta[];
  posterPath: string | null;
  startDate: string | null;
  title: string | null;
}

/** The seasons' labels and episodes, which an edit made from an outdated copy would overwrite. */
export type MediaProgramSeasonOutline = Pick<MediaProgramSeason, "fileIds" | "id" | "label">;

/**
 * How many episodes without files count toward a total, and how many of those were watched
 * elsewhere. Skipped episodes count toward neither.
 */
export const countMissingEpisodes = (
  seasons: { episodes: MediaProgramEpisodeMeta[]; number: number | null }[],
  marks: MediaProgramMissingMarks | null,
) => {
  const keys = new Set(
    seasons.flatMap((season) =>
      season.episodes.map((episode) => getMissingEpisodeKey(season.number, episode.number)),
    ),
  );
  const counted = [...keys].filter((key) => marks?.[key] !== "skipped");

  return {
    total: counted.length,
    watched: counted.filter((key) => marks?.[key] === "watched").length,
  };
};

/** Source dates may be a year, a month, or a day. */
export const formatMediaProgramDate = (date: string | null) => {
  if (!date) return null;
  else if (date.length === 4) return date;
  else return dayjs(date).format(date.length === 7 ? "MMM YYYY" : "MMM D, YYYY");
};

/** The plan's details, limited to those changed from the existing program's saved details. */
export const getMediaProgramChanges = (plan: MediaProgramPlan): Partial<MediaProgramDetails> => {
  const details: MediaProgramDetails = {
    language: plan.language,
    medium: plan.medium,
    name: plan.name,
    type: plan.type,
    year: plan.year,
  };

  return plan.saved
    ? Object.fromEntries(
        Object.entries(details).filter(([key, value]) => plan.saved[key] !== value),
      )
    : details;
};

export const getMediaProgramDetails = (
  program: Partial<Pick<MediaProgramDetails, "language" | "medium" | "type" | "year">>,
) => [program.year, program.type, program.medium, program.language].filter(Boolean).join(" · ");

/** Episodes in season order; a file in several seasons counts once. */
export const getMediaProgramEpisodeIds = (seasons: Pick<MediaProgramSeason, "fileIds">[]) => [
  ...new Set(seasons.flatMap((season) => season.fileIds.map(String))),
];

/** The status of the nearest folder above the program named after one, such as Inactive. */
export const getMediaProgramFolderWatchStatus = (folderPath: string): MediaProgramWatchStatus => {
  const statuses = path
    .dirname(folderPath)
    .split(path.sep)
    .reverse()
    .map(
      (part) =>
        MEDIA_PROGRAM_WATCH_STATUSES.find(({ label }) => label.toLowerCase() === part.toLowerCase())
          ?.value,
    );

  return statuses.find(Boolean) ?? "unwatched";
};

/**
 * The metadata source's season number for each season: its own number, or its place when no
 * season is numbered. Unnumbered seasons beside numbered ones match none.
 */
export const getMediaProgramMetaSeasonNumbers = (seasons: Pick<MediaProgramSeason, "number">[]) => {
  const hasNumbers = seasons.some((season) => season.number !== null);

  return seasons.map((season, index) => season.number ?? (hasNumbers ? null : index + 1));
};

/**
 * Every episode the metadata source lists without a file, by its source season: those at numbers
 * no file of a season has, and those of the seasons the program has none of.
 */
export const getMediaProgramMissingEpisodes = (
  meta: MediaProgramMeta | null,
  seasons: MediaProgramSeason[],
) => {
  const numbers = getMediaProgramMetaSeasonNumbers(seasons);

  return [
    ...seasons.map((season, index) => ({
      episodes: getSeasonMissingEpisodes(season),
      number: numbers[index],
    })),
    ...getMissingMediaProgramSeasons(meta, seasons),
  ];
};

/** The first grid option outside its range, or null when every option is within it. */
export const getMediaProgramRankingLimitError = (options: MediaProgramRankingExport) => {
  const limit = Object.entries(MEDIA_PROGRAM_RANKING_LIMITS).find(
    ([key, { max, min }]) =>
      !Number.isSafeInteger(options[key]) || options[key] < min || options[key] > max,
  )?.[1];

  return limit ? `${limit.label} must be a whole number from ${limit.min} to ${limit.max}.` : null;
};

export const getMediaProgramSeasonOutlines = (
  seasons: MediaProgramSeasonOutline[],
): MediaProgramSeasonOutline[] =>
  seasons.map(({ fileIds, id, label }) => ({ fileIds: fileIds.map(String), id, label }));

/** An episode's key among a program's missing marks. */
export const getMissingEpisodeKey = (seasonNumber: number, episodeNumber: number) =>
  `${seasonNumber}:${episodeNumber}`;

/** The numbered seasons the metadata source lists that the program has none of. */
export const getMissingMediaProgramSeasons = (
  meta: MediaProgramMeta | null,
  seasons: Pick<MediaProgramSeason, "number">[],
) => {
  const numbers = new Set(getMediaProgramMetaSeasonNumbers(seasons));

  // Metadata saved before it listed the source's seasons, or their episodes, has none.
  return (meta?.seasons ?? [])
    .filter((season) => season.number > 0 && !numbers.has(season.number))
    .map((season) => ({ ...season, episodes: season.episodes ?? [] }));
};

const EPISODE_REGEXES = [
  /S\d{1,3}[\s._-]*E(\d{1,4})/i,
  /\bE(?:p(?:isode)?)?[\s._-]*(\d{1,4})\b/i,
  /\s-\s(\d{1,4})(?:v\d)?(?=\s|\[|\(|$)/,
  /#(\d{1,4})\b/,
];

const FILE_SEASON_REGEX = /S(\d{1,3})[\s._-]*E\d{1,4}/i;

const SEASON_REGEX = /^(?:s|season|series|cour|part)[\s._-]*0*(\d+)$/i;

const SPECIALS_REGEX = /^(?:extras?|oads?|ovas?|specials?)$/i;

const YEAR_REGEX = /[([]((?:19|20)\d{2})[)\]]/;

export const naturalCompare = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

/** The season an episode's file name gives, such as 3 for "Show - S03E20". */
export const parseFileSeasonNumber = (fileName: string) => {
  const match = fileName.match(FILE_SEASON_REGEX);
  return match ? Number(match[1]) : null;
};

export const parseEpisodeNumber = (fileName: string) => {
  for (const regex of EPISODE_REGEXES) {
    const match = fileName.match(regex);

    if (match) return Number(match[1]);
  }

  return null;
};

/** The highest episode number the files' names give, or null when none gives one. */
export const getLastEpisodeNumber = (fileNames: string[]) => {
  const numbers = fileNames.map(parseEpisodeNumber).filter(Number.isFinite);
  return numbers.length ? Math.max(...numbers) : null;
};

/** Season folders such as S01, Season 1, Series 02, and Part 3. Specials and extras are season 0. */
export const parseSeasonNumber = (folderName: string) => {
  const name = folderName.trim();

  if (SPECIALS_REGEX.test(name)) return 0;

  const match = name.match(SEASON_REGEX);

  return match ? Number(match[1]) : null;
};

export const parseMediaProgramName = (folderName: string) => {
  const year = folderName.match(YEAR_REGEX)?.[1];
  const name = folderName
    .replace(YEAR_REGEX, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return { name: name || folderName, year: year ? Number(year) : null };
};

export const parseMediaProgramYear = (fileName: string) => {
  const year = fileName.match(YEAR_REGEX)?.[1];

  return year ? Number(year) : null;
};

/**
 * An import root is part of one program when it is a season folder itself, when a folder directly
 * inside it is a season folder, or when it holds no folders at all. Otherwise it is a library whose
 * folders are each a program.
 */
export const getIsMediaProgramRoot = (filePaths: Iterable<string>, rootFolderPath: string) => {
  if (parseSeasonNumber(path.basename(rootFolderPath)) !== null) return true;

  const rootParts = rootFolderPath.split(path.sep);
  let hasFolders = false;

  for (const filePath of filePaths) {
    const parts = path.dirname(filePath).split(path.sep);

    if (
      parts.length > rootParts.length &&
      parts.slice(0, rootParts.length).join(path.sep) === rootFolderPath
    ) {
      if (parseSeasonNumber(parts[rootParts.length]) !== null) return true;

      hasFolders = true;
    }
  }

  return !hasFolders;
};

/**
 * The program folder is the import root when it is a program, the folder above it when the root is
 * itself a season folder, such as one of several season folders imported together, two folders up
 * when the root is the extras of a numbered season folder, or else the first folder below the root.
 * Every folder below the program folder becomes its own season, numbered only when it sits
 * directly in the program folder, and files directly in the program folder are given a season
 * after the scan, from their names or after its last numbered one. Loose files in a library root
 * belong to no program.
 */
export const resolveMediaProgramFolder = (
  folderPath: string,
  rootFolderIndex: number,
  isProgramRoot: boolean,
) => {
  const parts = folderPath.split(path.sep);

  if (!isProgramRoot && parts.length <= rootFolderIndex + 1) return null;

  const isSeasonRoot =
    isProgramRoot && rootFolderIndex > 0 && parseSeasonNumber(parts[rootFolderIndex]) !== null;
  const isSeasonExtrasRoot =
    isSeasonRoot && rootFolderIndex > 1 && parseSeasonNumber(parts[rootFolderIndex - 1]) > 0;
  const programIndex = isSeasonExtrasRoot
    ? rootFolderIndex - 2
    : isSeasonRoot
      ? rootFolderIndex - 1
      : isProgramRoot
        ? rootFolderIndex
        : rootFolderIndex + 1;
  const seasonParts = parts.slice(programIndex + 1);

  return {
    programFolderName: parts[programIndex],
    programFolderPath: parts.slice(0, programIndex + 1).join(path.sep),
    seasonLabel: seasonParts.join(" - "),
    // Folders inside a season folder, such as its extras, are seasons of their own.
    seasonNumber: seasonParts.length === 1 ? parseSeasonNumber(seasonParts[0]) : null,
  };
};

type SeasonEpisodes = Pick<MediaProgramSeason, "episodeNumbers" | "fileIds">;

/**
 * Each episode's number in season order: its saved number unless that comes before the previous
 * episode's, or else the next one. Episodes share a number only when saved with it, such as two
 * files named as one episode. Seasons saved before episodes had numbers count up from 1.
 */
export const getSeasonEpisodeNumbers = (season: SeasonEpisodes) => {
  let previous = 0;
  let previousSaved: number = null;

  return season.fileIds.map((fileId) => {
    const saved = season.episodeNumbers?.[String(fileId)];

    previous =
      saved > previous || (saved === previous && saved === previousSaved) ? saved : previous + 1;
    previousSaved = saved;

    return previous;
  });
};

/** A season's episodes the metadata source lists at numbers none of its files have. */
export const getSeasonMissingEpisodes = (
  season: SeasonEpisodes & Pick<MediaProgramSeason, "meta">,
) => {
  const numbers = new Set(getSeasonEpisodeNumbers(season));
  return (season.meta?.episodes ?? []).filter((episode) => !numbers.has(episode.number));
};

/** The episodes in order with the numbers to save; those without one follow the episode before. */
const toSeasonEpisodes = (episodes: { fileId: string; number: number | null }[]) => {
  const fileIds = episodes.map(({ fileId }) => fileId);
  const numbers = getSeasonEpisodeNumbers({
    episodeNumbers: Object.fromEntries(
      episodes
        .filter(({ number }) => number !== null)
        .map(({ fileId, number }) => [fileId, number]),
    ),
    fileIds,
  });

  return {
    episodeNumbers: Object.fromEntries(fileIds.map((fileId, index) => [fileId, numbers[index]])),
    fileIds,
  };
};

/**
 * Adds files to a season at the numbers their names give, such as 16 to 18 into a season of 1 to
 * 10, when each gives a different number no episode has. Otherwise they follow its last episode.
 */
export const addSeasonEpisodes = (
  season: SeasonEpisodes,
  files: { id: string; name: string }[],
) => {
  const numbers = getSeasonEpisodeNumbers(season);
  const fileIds = season.fileIds.map(String);
  const existingIds = new Set(fileIds);
  const takenNumbers = new Set(numbers);

  const added = files
    .filter((file) => !existingIds.has(file.id))
    .map((file) => ({ fileId: file.id, number: parseEpisodeNumber(file.name) }));

  const isNumbered =
    added.every(({ number }) => number !== null && !takenNumbers.has(number)) &&
    new Set(added.map(({ number }) => number)).size === added.length;

  const episodes = [
    ...fileIds.map((fileId, index) => ({ fileId, number: numbers[index] })),
    ...(isNumbered ? added : added.map(({ fileId }) => ({ fileId, number: null }))),
  ];

  return toSeasonEpisodes(isNumbered ? episodes.sort((a, b) => a.number - b.number) : episodes);
};

/**
 * Moves the selected episodes up to `delta` numbers earlier or later: into a number no episode
 * has, or swapping with the unselected episodes that have it. Episodes leaving a number they share
 * with unselected ones join the episodes at the next instead, so only they move until they reach a
 * free number. Selected episodes sharing a number move together, and episodes stop at number 1.
 */
export const moveSeasonEpisodes = (
  season: SeasonEpisodes,
  isSelected: (fileId: string) => boolean,
  { delta, down }: { delta: number; down: boolean },
) => {
  const resolved = getSeasonEpisodeNumbers(season);
  const numbers = new Map(season.fileIds.map((fileId, index) => [String(fileId), resolved[index]]));
  const owners = new Map<number, string[]>();
  const selectedIds = season.fileIds.map(String).filter(isSelected);

  for (const [fileId, number] of numbers)
    owners.set(number, [...(owners.get(number) ?? []), fileId]);

  // The episodes leading the move go first, so the others follow into the number they leave.
  if (down) selectedIds.reverse();

  for (let step = 0; step < delta; step++) {
    for (const number of new Set(selectedIds.map((fileId) => numbers.get(fileId)))) {
      const target = down ? number + 1 : number - 1;
      const targetOwners = owners.get(target) ?? [];

      if (target < 1 || targetOwners.some(isSelected)) continue;

      const atNumber = owners.get(number);
      const moving = atNumber.filter(isSelected);
      const staying = atNumber.filter((fileId) => !isSelected(fileId));
      const swapped = staying.length ? [] : targetOwners;

      for (const fileId of moving) numbers.set(fileId, target);
      for (const fileId of swapped) numbers.set(fileId, number);

      owners.set(number, [...staying, ...swapped]);
      owners.set(target, staying.length ? [...targetOwners, ...moving] : moving);
    }
  }

  return toSeasonEpisodes(
    [...numbers]
      .map(([fileId, number]) => ({ fileId, number }))
      .sort((a, b) => a.number - b.number),
  );
};

/** The season's episodes with every number saved, dropping those of files no longer in it. */
export const normalizeSeasonEpisodes = (season: SeasonEpisodes) =>
  toSeasonEpisodes(
    season.fileIds.map((fileId) => ({
      fileId: String(fileId),
      number: season.episodeNumbers?.[String(fileId)] ?? null,
    })),
  );

/**
 * Gives episodes the numbers targeted for them, in the targets' order, with those targeting the
 * same number sharing it and those targeting none or an earlier one following the one before. The
 * other episodes keep their numbers where free, or move to the next free one after, keeping their
 * order, any numbers they share, and any gaps after them.
 */
const placeSeasonEpisodes = (
  season: SeasonEpisodes,
  targets: { fileId: string; number: number | null }[],
) => {
  const resolved = getSeasonEpisodeNumbers(season);
  const targetIds = new Set(targets.map(({ fileId }) => fileId));

  let lastPlaced = 0;

  const placed = targets.map(({ fileId, number }) => {
    lastPlaced = number > 0 && number >= lastPlaced ? number : lastPlaced + 1;

    return { fileId, number: lastPlaced };
  });

  const placedNumbers = new Set(placed.map(({ number }) => number));
  let lastOther = 0;
  let lastResolved: number = null;

  const others = season.fileIds
    .map((fileId, index) => ({ fileId: String(fileId), number: resolved[index] }))
    .filter(({ fileId }) => !targetIds.has(fileId))
    .map(({ fileId, number }) => {
      if (number !== lastResolved) {
        lastOther = Math.max(number, lastOther + 1);

        while (placedNumbers.has(lastOther)) lastOther++;
      }

      lastResolved = number;

      return { fileId, number: lastOther };
    });

  return toSeasonEpisodes([...placed, ...others].sort((a, b) => a.number - b.number));
};

/** Numbers the selected episodes up from the first number, in their order. */
export const numberSeasonEpisodes = (
  season: SeasonEpisodes,
  isSelected: (fileId: string) => boolean,
  firstNumber: number,
) =>
  placeSeasonEpisodes(
    season,
    season.fileIds
      .map(String)
      .filter(isSelected)
      .map((fileId, index) => ({ fileId, number: firstNumber + index })),
  );

/**
 * Numbers episodes by the numbers their names give less the offset, such as 13 to 24 becoming 1 to
 * 12 for a second season named in a run across seasons. Those whose names give the same number
 * share it, and those whose names give none go last.
 */
export const numberSeasonEpisodesFromNames = (
  season: SeasonEpisodes,
  fileNames: Map<string, string>,
  offset: number,
) =>
  placeSeasonEpisodes(
    season,
    season.fileIds
      .map(String)
      .filter((fileId) => fileNames.has(fileId))
      .map((fileId) => {
        const number = parseEpisodeNumber(fileNames.get(fileId)) - offset;

        return { fileId, number: number > 0 ? number : null };
      })
      .sort((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity)),
  );

/**
 * Moves each episode of the source seasons whose file name gives a season, such as S02E05, into
 * that season at the number it gives, adding the seasons the program lacks after the last one
 * numbered before them. Episodes given one number share it, those given episode 0 go last, and
 * seasons the move empties are removed. Counts the episodes whose names gave a season, and those
 * of them that changed season or number.
 */
export const splitSeasonsByFileNames = (
  seasons: MediaProgramSeasonInput[],
  sourceIds: Set<string>,
  fileNames: Map<string, string>,
) => {
  const moves = new Map<
    string,
    {
      number: number | null;
      seasonNumber: number;
      source: MediaProgramSeasonInput;
      sourceNumber: number;
    }
  >();

  for (const season of seasons.filter(({ id }) => sourceIds.has(id))) {
    const resolved = getSeasonEpisodeNumbers(season);

    season.fileIds.map(String).forEach((fileId, index) => {
      const name = fileNames.get(fileId) ?? "";
      const seasonNumber = parseFileSeasonNumber(name);
      const number = parseEpisodeNumber(name);

      if (seasonNumber !== null)
        moves.set(fileId, {
          number: number > 0 ? number : null,
          seasonNumber,
          source: season,
          sourceNumber: resolved[index],
        });
    });
  }

  const split = [...seasons];
  const seasonNumbers = [
    ...new Set([...moves.values()].map(({ seasonNumber }) => seasonNumber)),
  ].sort((a, b) => a - b);

  for (const seasonNumber of seasonNumbers) {
    if (split.some(({ number }) => number === seasonNumber)) continue;

    const sortKey = getSeasonSortKey(seasonNumber);
    const index = split.findLastIndex(({ number }) => getSeasonSortKey(number) <= sortKey);

    split.splice(index + 1, 0, {
      episodeNumbers: {},
      fileIds: [],
      label: makeSeasonLabel(seasonNumber),
      number: seasonNumber,
      rating: 0,
      ratingIsManual: false,
    });
  }

  const targets = new Map(
    seasonNumbers.map((seasonNumber) => [
      seasonNumber,
      split.find(({ number }) => number === seasonNumber),
    ]),
  );

  const getTarget = (fileId: string) => targets.get(moves.get(fileId)?.seasonNumber);

  const results = split.map((season) => {
    const resolved = getSeasonEpisodeNumbers(season);
    const kept = season.fileIds
      .map((fileId, index) => ({ fileId: String(fileId), number: resolved[index] }))
      .filter(
        ({ fileId }) =>
          !moves.has(fileId) || (!sourceIds.has(season.id) && getTarget(fileId) !== season),
      );
    const added = [...moves]
      .filter(([fileId]) => getTarget(fileId) === season)
      .map(([fileId, { number }]) => ({ fileId, number }));

    return {
      ...season,
      ...toSeasonEpisodes(
        [...kept, ...added].sort((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity)),
      ),
    };
  });

  const resultsBySeason = new Map(split.map((season, index) => [season, results[index]]));

  return {
    movedCount: [...moves].filter(
      ([fileId, { source, sourceNumber }]) =>
        getTarget(fileId) !== source ||
        resultsBySeason.get(source).episodeNumbers[fileId] !== sourceNumber,
    ).length,
    namedCount: moves.size,
    seasons: results.filter(
      (season, index) =>
        season.fileIds.length || !sourceIds.has(season.id) || !split[index].fileIds.length,
    ),
  };
};

/** Numbered seasons first, then other folders, then specials. */
export const getSeasonSortKey = (seasonNumber: number | null) => {
  if (seasonNumber === null) return 100_000;
  else if (seasonNumber === 0) return 200_000;
  else return seasonNumber;
};

/** An episode's label, such as EP 104, or S05E03 with its season's number when it has one. */
export const makeEpisodeLabel = (
  episodeNumber: number,
  seasonNumber: number | null,
  labels: MediaProgramEpisodeLabels,
) =>
  labels === "season" && seasonNumber !== null
    ? `${makeSeasonLabel(seasonNumber)}E${Fmt.leadZeros(episodeNumber, 2)}`
    : `EP ${episodeNumber}`;

/** Labels a season like the season folders it sits beside, such as S03. */
export const makeSeasonLabel = (seasonNumber: number) => `S${Fmt.leadZeros(seasonNumber, 2)}`;

export const makeSeasonTitle = (programName: string, seasonLabel: string) =>
  seasonLabel ? `${programName} - ${seasonLabel}` : programName;

/** Episode numbers order a season when every file has a distinct one; otherwise names do. */
export const sortEpisodeNames = <T>(items: T[], getName: (item: T) => string) => {
  const numbers = items.map((item) => parseEpisodeNumber(getName(item)));
  const hasDistinctNumbers =
    numbers.every((number) => number !== null) && new Set(numbers).size === numbers.length;

  return items
    .map((item, index) => ({ item, number: numbers[index] }))
    .sort((a, b) =>
      hasDistinctNumbers ? a.number - b.number : naturalCompare(getName(a.item), getName(b.item)),
    )
    .map(({ item }) => item);
};
