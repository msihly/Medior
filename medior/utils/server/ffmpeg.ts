import type { FfmpegCommand } from "fluent-ffmpeg";

/** Read when called, since the paths may be set after this module loads. */
export const getFfmpegPath = () => process.env.FFMPEG_PATH || "ffmpeg";

export const getFfprobePath = () => process.env.FFPROBE_PATH || "ffprobe";

/**
 * Runs an ffmpeg command until it ends, killing it once the signal aborts, including an abort
 * that arrives before ffmpeg has started. An aborted run rejects with the abort reason instead of
 * ffmpeg's kill error.
 */
export const runFfmpegCommand = (command: FfmpegCommand, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    signal?.throwIfAborted();

    const abort = () => command.kill("SIGKILL");

    command
      .on("start", () => {
        if (signal?.aborted) abort();
      })
      .on("end", () => {
        signal?.removeEventListener("abort", abort);
        resolve();
      })
      .on("error", (error) => {
        signal?.removeEventListener("abort", abort);
        reject(signal?.aborted ? signal.reason : error);
      });

    signal?.addEventListener("abort", abort, { once: true });
    command.run();
  });
