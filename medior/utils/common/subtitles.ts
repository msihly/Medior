import path from "path";
import { naturalCompare } from "medior/utils/common/media-programs";

export const SUBTITLE_EXTS = ["ass", "idx", "srt", "ssa", "sub", "vtt"];

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

export interface SubtitleSegment {
  end: number;
  start: number;
  text: string;
}

export interface SubtitleSource {
  path: string;
}

const decodeCueEntities = (text: string) =>
  text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");

const parseCueTime = (value: string) =>
  value
    .trim()
    .split(/\s+/)[0]
    .split(":")
    .map(Number)
    .reduce((total, part) => total * 60 + part, 0);

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

const getPathKey = (filePath: string) => {
  const { dir, name } = path.parse(filePath);

  return path.join(dir, name).toLowerCase();
};

/**
 * Keys are paths without the extension, matching their video's. Exported copies are numbered after
 * their video with `-sub-N`, unless another file is named exactly like them.
 */
const getSubtitleKeys = (filePath: string, mediaKeys = new Set<string>()) => {
  const key = getPathKey(filePath);
  const exportedKey = key.replace(/-sub-\d+$/, "");

  return exportedKey === key || mediaKeys.has(key) ? [key] : [key, exportedKey];
};

const replaceExt = (filePath: string, ext: string) =>
  `${filePath.slice(0, filePath.length - path.extname(filePath).length)}${ext}`.toLowerCase();

export const makeSubtitlePathMap = (filePaths: Iterable<string>) => {
  const allPaths = [...filePaths];
  const mediaKeys = new Set(
    allPaths.filter((filePath) => !getIsSubtitle(filePath)).map((filePath) => getPathKey(filePath)),
  );
  const subtitlePaths = new Map<string, string[]>();

  for (const filePath of allPaths) {
    if (!getIsSubtitle(filePath)) continue;

    for (const key of getSubtitleKeys(filePath, mediaKeys))
      subtitlePaths.set(key, [...(subtitlePaths.get(key) ?? []), filePath]);
  }

  return subtitlePaths;
};

/**
 * Subtitles are named after their video; a VobSub .sub travels with its .idx, which is unusable
 * without it. Matched subtitles leave the map, so videos sharing a name never both import (and
 * delete) the same file.
 */
export const matchSubtitleFiles = (
  subtitlePaths: Map<string, string[]>,
  videoPath: string,
): SubtitleSource[] => {
  const filePaths = subtitlePaths.get(getPathKey(videoPath)) ?? [];
  const matchedPaths = new Set(filePaths.map((filePath) => filePath.toLowerCase()));

  for (const filePath of filePaths) {
    for (const key of getSubtitleKeys(filePath)) {
      const remaining = (subtitlePaths.get(key) ?? []).filter((other) => other !== filePath);

      if (remaining.length) subtitlePaths.set(key, remaining);
      else subtitlePaths.delete(key);
    }
  }

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
