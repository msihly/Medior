import { shell } from "@electron/remote";
import fs from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import { ExternalPlayer, getConfig, rpc, VideoPlayer } from "medior/utils/server";

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
  const parts = splitArgs(args);
  // A replacer function keeps "$" sequences in the path from being read as patterns.
  const resolved = parts.map((part) => part.replaceAll("{path}", () => filePath));

  return parts.some((part) => part.includes("{path}")) ? resolved : [...resolved, filePath];
};

/** The video player's seek arguments with {seconds} as whole seconds, as PotPlayer's /seek takes. */
const getSeekArgs = (args: string, seconds: number) =>
  splitArgs(args).map((part) => part.replaceAll("{seconds}", String(Math.floor(seconds))));

const splitArgs = (args: string) =>
  [...args.matchAll(/"([^"]*)"|(\S+)/g)].map((match) => match[1] ?? match[2]);

/**
 * Opens the videos natively as a playlist of up to 100, starting from the given one, with the video
 * player. `seconds` starts that video there, which needs it to still exist.
 */
export const openVideoPlaylist = async ({
  fileId,
  fileIds,
  seconds,
  signal,
}: {
  fileId: string;
  fileIds: string[];
  seconds?: number;
  signal?: AbortSignal;
}) => {
  const indexes = new Map(fileIds.map((id, index) => [id, index]));

  const res = await rpc.listFile(
    { args: { filter: { id: [...indexes.keys()] }, page: 1, pageSize: indexes.size } },
    { signal },
  );

  signal?.throwIfAborted();

  if (!res.success) throw new Error(res.error);

  const files = [...res.data.items].sort((a, b) => indexes.get(a.id) - indexes.get(b.id));
  const activeIndex = files.findIndex((file) => file.id === fileId);
  if (activeIndex < 0 && seconds != null) throw new Error("The video no longer exists.");

  const startIndex = Math.max(activeIndex, 0);
  const playlistPath = await writePlaylist(
    files
      .slice(startIndex, startIndex + 100)
      .map((file) => ({ path: file.path, title: file.originalName })),
    signal,
  );

  signal?.throwIfAborted();
  await openWithPlayer(playlistPath, getConfig().file.videoPlayer, seconds);
};

/**
 * Opens a file or playlist with the player, or with Windows' default program when it has none.
 * `seconds` starts it there through a video player's seek arguments, which the default program
 * can't take.
 */
export const openWithPlayer = async (
  filePath: string,
  player: ExternalPlayer | VideoPlayer,
  seconds?: number,
) => {
  if (!player?.path) {
    const error = await shell.openPath(filePath);
    if (error) throw new Error(error);
  } else {
    const seekArgs =
      seconds != null && "seekArgs" in player && player.seekArgs
        ? getSeekArgs(player.seekArgs, seconds)
        : [];

    await new Promise<void>((resolve, reject) => {
      const child = spawn(player.path, [...getPlayerArgs(player.args, filePath), ...seekArgs], {
        detached: true,
        stdio: "ignore",
      });

      child.once("error", reject);
      child.once("spawn", () => {
        child.unref();
        resolve();
      });
    });
  }
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
