import { shell } from "@electron/remote";
import fs from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import { ExternalPlayer, getConfig } from "medior/utils/server";

/** A file in a playlist, with the title and length players show for it. */
export interface PlaylistEntry {
  /** Seconds, or none for players to read from the file. */
  duration?: number;
  path: string;
  title: string;
}

/**
 * The player's arguments, split at spaces outside double quotes, with {path} as the given path.
 * Arguments without {path} get the path after them, so the player always receives it.
 */
const getPlayerArgs = (args: string, filePath: string) => {
  const parts = [...args.matchAll(/"([^"]*)"|(\S+)/g)].map((match) => match[1] ?? match[2]);
  // A replacer function keeps "$" sequences in the path from being read as patterns.
  const resolved = parts.map((part) => part.replaceAll("{path}", () => filePath));

  return parts.some((part) => part.includes("{path}")) ? resolved : [...resolved, filePath];
};

/** Opens a file or playlist with the player, or with Windows' default program when it has none. */
export const openWithPlayer = async (filePath: string, player: ExternalPlayer) => {
  if (!player?.path) {
    const error = await shell.openPath(filePath);
    if (error) throw new Error(error);
  } else
    await new Promise<void>((resolve, reject) => {
      const child = spawn(player.path, getPlayerArgs(player.args, filePath), {
        detached: true,
        stdio: "ignore",
      });

      child.once("error", reject);
      child.once("spawn", () => {
        child.unref();
        resolve();
      });
    });
};

/** Writes Medior's playlist file, in the first storage location, and returns its path. */
export const writePlaylist = async (entries: PlaylistEntry[], signal?: AbortSignal) => {
  const [location] = getConfig().db.fileStorage.locations;
  if (!location) throw new Error("No file storage locations are configured.");

  const playlistPath = path.resolve(location, "playlist.m3u8");
  const lines = entries.flatMap((entry) => [
    `#EXTINF:${Math.round(entry.duration ?? 0)},${entry.title}`,
    entry.path,
  ]);

  await fs.mkdir(path.dirname(playlistPath), { recursive: true });
  signal?.throwIfAborted();
  await fs.writeFile(playlistPath, ["#EXTM3U", ...lines, ""].join("\r\n"), {
    encoding: "utf8",
    signal,
  });

  return playlistPath;
};
