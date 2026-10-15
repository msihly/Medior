import path from "path";

export const MEDIA_PROGRAM_WATCH_STATUSES = [
  { label: "Unwatched", value: "unwatched" },
  { label: "Watching", value: "watching" },
  { label: "Watched", value: "watched" },
  { label: "Inactive", value: "inactive" },
  { label: "Dropped", value: "dropped" },
] as const;

export type MediaProgramWatchStatus = (typeof MEDIA_PROGRAM_WATCH_STATUSES)[number]["value"];

type MediaProgramDetails = Pick<MediaProgramPlan, "language" | "medium" | "name" | "type" | "year">;

/**
 * Program details carried by each season's import batch until its collection is created. Existing
 * programs only receive the details edited in the Import Editor.
 */
export interface MediaProgramImport extends Partial<MediaProgramDetails> {
  seasonIndex: number;
  sourceFolderPath: string;
}

/** A program detected by the Import Editor, edited before its seasons are imported. */
export interface MediaProgramPlan {
  existingId?: string;
  fileCount: number;
  folderPath: string;
  language: string;
  medium: string;
  name: string;
  /** Seasons new to an existing program follow its current seasons. */
  nextSeasonIndex: number;
  /** Details of the existing program when it was scanned. */
  saved?: MediaProgramDetails;
  seasonLabels: string[];
  type: string;
  year: number | null;
}

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

const EPISODE_REGEXES = [
  /S\d{1,3}[\s._-]*E(\d{1,4})/i,
  /\bE(?:p(?:isode)?)?[\s._-]*(\d{1,4})\b/i,
  /\s-\s(\d{1,4})(?:v\d)?(?=\s|\[|\(|$)/,
  /#(\d{1,4})\b/,
];

const SEASON_REGEX = /^(?:s|season|series|cour|part)[\s._-]*0*(\d+)$/i;

const SPECIALS_REGEX = /^(?:extras?|oads?|ovas?|specials?)$/i;

const YEAR_REGEX = /[([]((?:19|20)\d{2})[)\]]/;

export const naturalCompare = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

export const parseEpisodeNumber = (fileName: string) => {
  for (const regex of EPISODE_REGEXES) {
    const match = fileName.match(regex);

    if (match) return Number(match[1]);
  }

  return null;
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
 * An import root is itself one program when a folder directly inside it is a season folder, or
 * when it holds no folders at all. Otherwise it is a library whose folders are each a program.
 */
export const getIsMediaProgramRoot = (filePaths: Iterable<string>, rootFolderPath: string) => {
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
 * The program folder is the import root when it is a program, or else the first folder below it.
 * Every folder below the program folder becomes its own season. Loose files in a library root
 * belong to no program.
 */
export const resolveMediaProgramFolder = (
  folderPath: string,
  rootFolderIndex: number,
  isProgramRoot: boolean,
) => {
  const parts = folderPath.split(path.sep);

  if (!isProgramRoot && parts.length <= rootFolderIndex + 1) return null;

  const programIndex = isProgramRoot ? rootFolderIndex : rootFolderIndex + 1;
  const seasonParts = parts.slice(programIndex + 1);

  return {
    programFolderName: parts[programIndex],
    programFolderPath: parts.slice(0, programIndex + 1).join(path.sep),
    seasonLabel: seasonParts.join(" - "),
    seasonNumber: seasonParts.length ? parseSeasonNumber(seasonParts[0]) : null,
  };
};

/** Files directly in the program folder first, then numbered seasons, other folders, and specials. */
export const getSeasonSortKey = (seasonNumber: number | null, hasLabel: boolean) => {
  if (!hasLabel) return -1;
  else if (seasonNumber === null) return 100_000;
  else if (seasonNumber === 0) return 200_000;
  else return seasonNumber;
};

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
