import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { checkFileExists, fileLog } from "trabecula/utils/server";
import { copyMediaFile, hashMediaFile, syncMediaFile } from "medior/utils/server/media-output";
import { moveFileNoReplace } from "medior/utils/server/move-file";
import { workSignal } from "medior/utils/server/work-signal";

/** A PotPlayer bookmark, at seconds into its video. */
export interface PotPlayerBookmark {
  position: number;
  title: string;
}

/**
 * A file's latest PotPlayer bookmark, where an unfinished watch continues, with when its bookmarks
 * were last saved.
 */
export interface FileContinuePoint extends PotPlayerBookmark {
  duration: number;
  fileId: string;
  savedAt: number;
}

/**
 * Bookmark files are read as UTF-16 when they start with its byte order mark or their first
 * character's second byte is empty, and as UTF-8 otherwise.
 */
const decodeBookmarkFile = (buffer: Buffer) =>
  new TextDecoder(
    buffer[0] === 0xfe && buffer[1] === 0xff
      ? "utf-16be"
      : (buffer[0] === 0xff && buffer[1] === 0xfe) || buffer[1] === 0
        ? "utf-16le"
        : "utf-8",
  ).decode(buffer);

/**
 * Copies the video's PotPlayer bookmarks beside another copy of it, verified and flushed under a
 * temporary name before taking their place. Bookmarks already there stay. Resolves to whether the
 * copy's bookmarks match the video's, which is false when it has none. A failed copy is logged and
 * leaves the bookmarks where they are, so the work on their video goes on without them.
 */
export const copyPotPlayerBookmarks = async (mediaPath: string, targetMediaPath: string) => {
  const sourcePath = getPotPlayerBookmarkPath(mediaPath);
  const targetPath = getPotPlayerBookmarkPath(targetMediaPath);
  const tempPath = `${targetPath}.${randomUUID()}.partial`;

  try {
    if (!(await checkFileExists(sourcePath))) return false;

    const hash = await hashMediaFile(sourcePath);

    try {
      await copyMediaFile(sourcePath, tempPath, true);
      await syncMediaFile(tempPath, hash);
      await moveFileNoReplace(tempPath, targetPath);

      return true;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;

      return (await hashMediaFile(targetPath)) === hash;
    }
  } catch (error) {
    workSignal.getStore()?.throwIfAborted();
    fileLog(`Failed to copy the PotPlayer bookmarks of ${mediaPath}: ${error.message}`, {
      type: "error",
    });

    return false;
  } finally {
    await fs.rm(tempPath, { force: true });
  }
};

/** PotPlayer saves a video's bookmarks beside it, named after it with the extension replaced. */
export const getPotPlayerBookmarkPath = (mediaPath: string) => {
  const { dir, name } = path.parse(mediaPath);

  return path.join(dir, `${name}.pbf`);
};

/**
 * The bookmarks of the `[Bookmark]` section in their saved order, from entries such as
 * `0=94035*Bookmark 1*<thumbnail>`, which hold milliseconds, a title, and a thumbnail. PotPlayer
 * saves other lists, such as A-B repeats, in other sections, and leaves its last entry empty.
 */
export const parsePotPlayerBookmarks = (text: string): PotPlayerBookmark[] => {
  const entries: (PotPlayerBookmark & { index: number })[] = [];
  let isBookmarkSection = false;

  for (const line of text.split(/\r?\n/)) {
    const section = /^\s*\[(.*)\]\s*$/.exec(line);
    const entry = /^\s*(\d+)=(\d+)\*(.*)$/.exec(line);

    if (section) isBookmarkSection = section[1].trim().toLowerCase() === "bookmark";
    else if (isBookmarkSection && entry) {
      const [, index, position, rest] = entry;
      // The thumbnail follows the last asterisk, so titles may hold their own.
      const title = rest.includes("*") ? rest.slice(0, rest.lastIndexOf("*")) : rest;

      entries.push({ index: Number(index), position: Number(position) / 1000, title });
    }
  }

  return entries
    .sort((a, b) => a.index - b.index)
    .map(({ position, title }) => ({ position, title }));
};

/**
 * The video's latest PotPlayer bookmark, where an unfinished watch continues, with when its
 * bookmarks were last saved, or null without one.
 */
export const readPotPlayerContinuePoint = async (mediaPath: string) => {
  try {
    const handle = await fs.open(getPotPlayerBookmarkPath(mediaPath), "r");

    try {
      const stats = await handle.stat();
      const bookmark = parsePotPlayerBookmarks(decodeBookmarkFile(await handle.readFile())).at(-1);

      return bookmark ? { ...bookmark, savedAt: stats.mtimeMs } : null;
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (error.code === "ENOENT") return null;

    throw error;
  }
};
