import path from "path";
import { naturalCompare } from "medior/utils/common/media-programs";

export const SUBTITLE_EXTS = ["ass", "idx", "srt", "ssa", "sub", "vtt"];

/** Languages' English names by code, which subtitles named by language alone use. */
const LANGUAGE_NAMES = new Intl.DisplayNames(["en"], { fallback: "none", type: "language" });

/** Names hold a few tags at most, such as `.en.sdh.forced`. */
const SUBTITLE_TAG_LIMIT = 3;

/** A language or flag tag ending a subtitle's name, such as `.en`, `.pt-BR`, `.English`, `.forced`. */
const SUBTITLE_TAG_REGEX = /\.[a-z]{2,}(?:[-_][a-z\d]{2,8})*$/i;

/** Subtitle stream codecs that convert to timed text the carousel can display. */
export const TEXT_SUBTITLE_CODECS = [
  "ass",
  "microdvd",
  "mov_text",
  "ssa",
  "subrip",
  "text",
  "webvtt",
];

export const SUBTITLE_MODES = [
  { label: "Ignore", value: "none" },
  { label: "Keep Beside Video", value: "keep" },
  { label: "Embed in Video", value: "embed" },
] as const;

export type SubtitleMode = (typeof SUBTITLE_MODES)[number]["value"];

/** How subtitles are matched to videos beyond being named exactly like them, from Settings. */
export interface SubtitleMatchOptions {
  /** Folders holding the subtitles of the videos beside them, sometimes in a folder per video. */
  folderNames: string[];
  /** Whether names may add language or flag tags to their video's. */
  withTags: boolean;
}

/** The scanned videos subtitles may belong to, by path key and by folder, with how to match them. */
interface SubtitleMatcher extends Pick<SubtitleMatchOptions, "withTags"> {
  folderNames: Set<string>;
  folderVideoKeys: Map<string, string[]>;
  videoKeys: Set<string>;
}

export interface SubtitleSegment {
  end: number;
  start: number;
  text: string;
}

export interface SubtitleSource {
  path: string;
}

/** Segments that replace a transcript from index `start` on, as a transcription adds or settles them. */
export interface TranscriptUpdate {
  segments: SubtitleSegment[];
  start: number;
}

const decodeCueEntities = (text: string) =>
  text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");

/** A cue time as SRT writes it, such as `01:02:03,456`. */
const formatSrtCueTime = (seconds: number) => {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const time = [
    Math.floor(ms / 3_600_000),
    Math.floor(ms / 60_000) % 60,
    Math.floor(ms / 1000) % 60,
  ]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");

  return `${time},${String(ms % 1000).padStart(3, "0")}`;
};

const parseCueTime = (value: string) =>
  value
    .trim()
    .split(/\s+/)[0]
    .split(":")
    .map(Number)
    .reduce((total, part) => total * 60 + part, 0);

/** Timed cues as an SRT subtitle file, numbered from 1 and leaving out cues without text. */
export const formatSrt = (segments: SubtitleSegment[]) =>
  `${segments
    .filter(({ text }) => text.trim())
    .map(
      ({ end, start, text }, index) =>
        `${index + 1}\n${formatSrtCueTime(start)} --> ${formatSrtCueTime(end)}\n${text.trim()}`,
    )
    .join("\n\n")}\n`;

export const getIsSubtitle = (filePath: string) =>
  SUBTITLE_EXTS.includes(path.extname(filePath).slice(1).toLowerCase());

/**
 * VobSub .idx indexes travel with the .sub images beside them. Files imported through a saved
 * request before its input kept missing values missing can hold null subtitles.
 */
export const getSubtitleFilePaths = (subtitles?: { path: string }[] | null) =>
  (subtitles ?? []).flatMap((subtitle) => {
    const { dir, ext, name } = path.parse(subtitle.path);

    return ext.toLowerCase() === ".idx"
      ? [subtitle.path, path.join(dir, `${name}.sub`)]
      : [subtitle.path];
  });

/** The English names of languages with two-letter codes, gathered on first use. */
let languageNameSet: Set<string> = null;

/**
 * Whether a subtitle is named by its language alone, such as `English`, `2_English`, `eng`, or
 * `English.forced`, rather than after a video.
 */
const getIsLanguageName = (name: string) => {
  const [language, ...flags] = name
    .replace(/^\d+[\s._-]/, "")
    .split(/[\s._()[\]-]+/)
    .filter(Boolean);

  if (!languageNameSet) {
    const letters = [..."abcdefghijklmnopqrstuvwxyz"];

    languageNameSet = new Set(
      letters
        .flatMap((first) =>
          letters.map((second) => LANGUAGE_NAMES.of(`${first}${second}`)?.toLowerCase()),
        )
        .filter(Boolean),
    );
  }

  return (
    !!language &&
    flags.length <= SUBTITLE_TAG_LIMIT &&
    flags.every((flag) => /^[a-z]+$/i.test(flag)) &&
    (languageNameSet.has(language.toLowerCase()) ||
      (/^[a-z]{2,3}$/i.test(language) && !!LANGUAGE_NAMES.of(language)))
  );
};

const getIsSubtitleFolder = (folderPath: string, folderNames: Set<string>) =>
  folderNames.has(path.basename(folderPath).toLowerCase());

const getPathKey = (filePath: string) => {
  const { dir, name } = path.parse(filePath);

  return path.join(dir, name).toLowerCase();
};

/**
 * A subtitle's possible video names: its own, without `-sub-N`, then, when tags are matched, without
 * each tag in turn.
 */
const getSubtitleNames = (name: string, withTags: boolean) => {
  const names = [name, name.replace(/-sub-\d+$/, "")];
  const tagLimit = withTags ? SUBTITLE_TAG_LIMIT : 0;
  let tagless = name;

  for (let count = 0; count < tagLimit && SUBTITLE_TAG_REGEX.test(tagless); count++) {
    tagless = tagless.replace(SUBTITLE_TAG_REGEX, "");
    names.push(tagless);
  }

  return names;
};

/**
 * Subtitles are named after their video, optionally followed by language or flag tags, or exported
 * after it with `-sub-N`. Ones in a Subs folder also belong to the folder holding it, to the video
 * their own folder inside it is named after, or, when named only by language, to that folder's one
 * video. A video named exactly like the subtitle wins over one its tags or number are dropped for.
 */
const getSubtitleVideoKey = (filePath: string, matcher: SubtitleMatcher) => {
  const { dir, name } = path.parse(filePath);
  const parentDir = path.dirname(dir);
  const isInSubtitleFolder = getIsSubtitleFolder(dir, matcher.folderNames);

  const names = getSubtitleNames(name, matcher.withTags);
  const keys = [
    ...(isInSubtitleFolder ? [dir, parentDir] : [dir]).flatMap((folderPath) =>
      names.map((cur) => path.join(folderPath, cur).toLowerCase()),
    ),
    ...(getIsSubtitleFolder(parentDir, matcher.folderNames)
      ? [path.join(path.dirname(parentDir), path.basename(dir)).toLowerCase()]
      : []),
  ];
  const folderKeys =
    isInSubtitleFolder && getIsLanguageName(name)
      ? (matcher.folderVideoKeys.get(path.join(parentDir).toLowerCase()) ?? [])
      : [];

  return (
    keys.find((key) => matcher.videoKeys.has(key)) ??
    (folderKeys.length === 1 ? folderKeys[0] : null)
  );
};

const replaceExt = (filePath: string, ext: string) =>
  `${filePath.slice(0, filePath.length - path.extname(filePath).length)}${ext}`.toLowerCase();

/** Groups the subtitles among the files under their video's path without its extension. */
export const makeSubtitlePathMap = (
  filePaths: Iterable<string>,
  videoPaths: string[],
  options: SubtitleMatchOptions,
) => {
  const videoKeys = new Set(videoPaths.map(getPathKey));
  const folderVideoKeys = new Map<string, string[]>();
  const subtitlePaths = new Map<string, string[]>();

  for (const key of videoKeys) {
    const folderKey = path.dirname(key);
    folderVideoKeys.set(folderKey, [...(folderVideoKeys.get(folderKey) ?? []), key]);
  }

  const matcher: SubtitleMatcher = {
    folderNames: new Set(options.folderNames.map((folderName) => folderName.trim().toLowerCase())),
    folderVideoKeys,
    videoKeys,
    withTags: options.withTags,
  };

  for (const filePath of filePaths) {
    const key = getIsSubtitle(filePath) ? getSubtitleVideoKey(filePath, matcher) : null;
    if (key) subtitlePaths.set(key, [...(subtitlePaths.get(key) ?? []), filePath]);
  }

  return subtitlePaths;
};

/**
 * A VobSub .sub travels with its .idx, which is unusable without it. Matched subtitles leave the
 * map, so videos sharing a name never both import (and delete) the same file.
 */
export const matchSubtitleFiles = (
  subtitlePaths: Map<string, string[]>,
  videoPath: string,
): SubtitleSource[] => {
  const key = getPathKey(videoPath);
  const filePaths = subtitlePaths.get(key) ?? [];
  const matchedPaths = new Set(filePaths.map((filePath) => filePath.toLowerCase()));

  subtitlePaths.delete(key);

  return filePaths
    .filter((filePath) => {
      const ext = path.extname(filePath).toLowerCase();

      if (ext === ".idx") return matchedPaths.has(replaceExt(filePath, ".sub"));
      else if (ext === ".sub") return !matchedPaths.has(replaceExt(filePath, ".idx"));
      else return true;
    })
    .sort(naturalCompare)
    .map((filePath) => ({ path: filePath }));
};

export const parseWebVtt = (text: string): SubtitleSegment[] => {
  const segments: SubtitleSegment[] = [];

  for (const block of text.replace(/\r/g, "").split(/\n{2,}/)) {
    const lines = block.split("\n");
    const timingIndex = lines.findIndex((line) => line.includes("-->"));

    if (timingIndex < 0) continue;

    const [start, end] = lines[timingIndex].split("-->").map(parseCueTime);
    const cueText = decodeCueEntities(
      lines
        .slice(timingIndex + 1)
        .join("\n")
        .replace(/<[^>]+>/g, "")
        .replace(/\{\\[^}]*\}/g, ""),
    ).trim();

    if (cueText && Number.isFinite(start) && Number.isFinite(end))
      segments.push({ end, start, text: cueText });
  }

  return segments;
};
