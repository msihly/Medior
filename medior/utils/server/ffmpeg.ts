import { execFile, spawn } from "child_process";
import { createInterface } from "readline";
import type { Writable } from "stream";

/** Read when called, since the paths may be set after this module loads. */
export const getFfmpegPath = () => process.env.FFMPEG_PATH || "ffmpeg";

export const getFfprobePath = () => process.env.FFPROBE_PATH || "ffprobe";

/** The parts of ffprobe's JSON output that Medior reads. */
export interface FfprobeData {
  format: {
    bit_rate?: string;
    duration?: number;
    format_name?: string;
    size?: number;
    tags?: Record<string, string | number>;
  };
  streams: {
    avg_frame_rate?: string;
    bit_rate?: string;
    codec_name?: string;
    codec_type?: string;
    /** Marks a video stream that is an audio file's cover art. */
    disposition?: { attached_pic?: number };
    duration?: string;
    height?: number;
    r_frame_rate?: string;
    tags?: Record<string, string | number>;
    width?: number;
  }[];
}

/** One report from ffmpeg's -progress output, such as frame, fps, total_size and out_time_us. */
export type FfmpegProgressReport = Record<string, string>;

/** A chapter a video's container marks, such as those PotPlayer shows, in seconds. */
export interface VideoChapter {
  end: number;
  start: number;
  title: string | null;
}

/** How much of the end of ffmpeg's error output is kept for failure messages. */
const MAX_ERROR_OUTPUT_LENGTH = 8192;

/** Runs ffprobe on the file with the arguments that choose what it shows, parsing its JSON. */
const runFfprobe = <T>(args: string[], filePath: string, signal?: AbortSignal) =>
  new Promise<T>((resolve, reject) => {
    signal?.throwIfAborted();

    execFile(
      getFfprobePath(),
      ["-v", "quiet", "-print_format", "json", ...args, filePath],
      { maxBuffer: 16 * 1024 * 1024, signal, windowsHide: true },
      (error, stdout) => {
        if (error) return reject(error);

        try {
          resolve(JSON.parse(stdout));
        } catch (parseError) {
          reject(parseError);
        }
      },
    );
  });

/** The chapters the file's container marks, in order. */
export const probeChapters = async (filePath: string, signal?: AbortSignal) => {
  const { chapters = [] } = await runFfprobe<{
    chapters?: { end_time?: string; start_time?: string; tags?: { title?: string } }[];
  }>(["-show_chapters"], filePath, signal);

  return chapters.map((chapter): VideoChapter => ({
    end: Number(chapter.end_time),
    start: Number(chapter.start_time),
    title: chapter.tags?.title || null,
  }));
};

export const probeMedia = (filePath: string, signal?: AbortSignal) =>
  runFfprobe<FfprobeData>(["-show_format", "-show_streams"], filePath, signal);

/**
 * Runs ffmpeg until it ends, killing it once the signal aborts, including an abort that arrives
 * before ffmpeg has started. An aborted run rejects with the abort reason instead of ffmpeg's kill
 * error. Progress reports come from ffmpeg's -progress output; `stdout` receives piped output.
 */
export const runFfmpeg = (
  args: string[],
  {
    onProgress,
    signal,
    stdout,
  }: {
    onProgress?: (report: FfmpegProgressReport) => void;
    signal?: AbortSignal;
    stdout?: Writable;
  } = {},
) =>
  new Promise<void>((resolve, reject) => {
    signal?.throwIfAborted();

    const ffmpeg = spawn(
      getFfmpegPath(),
      [
        "-nostdin",
        "-nostats",
        "-v",
        "error",
        "-y",
        ...(onProgress ? ["-progress", "pipe:1"] : []),
        ...args,
      ],
      {
        killSignal: "SIGKILL",
        signal,
        stdio: ["ignore", onProgress || stdout ? "pipe" : "ignore", "pipe"],
        windowsHide: true,
      },
    );

    let errorOutput = "";
    let report: FfmpegProgressReport = {};

    ffmpeg.stderr.setEncoding("utf8");
    ffmpeg.stderr.on("data", (chunk: string) => {
      errorOutput = (errorOutput + chunk).slice(-MAX_ERROR_OUTPUT_LENGTH);
    });

    if (stdout) ffmpeg.stdout.pipe(stdout);
    else if (onProgress) {
      // Each report is a run of key=value lines that ends with its progress state.
      createInterface({ input: ffmpeg.stdout }).on("line", (line) => {
        const separator = line.indexOf("=");
        const key = line.slice(0, separator);

        if (key !== "progress") report[key] = line.slice(separator + 1);
        else {
          onProgress(report);
          report = {};
        }
      });
    }

    // An abort also emits an error, but a started run settles once ffmpeg has exited.
    ffmpeg.on("error", (error) => {
      if (ffmpeg.pid === undefined) reject(error);
    });
    ffmpeg.on("close", (code, killSignal) => {
      if (signal?.aborted) reject(signal.reason);
      else if (killSignal) reject(new Error(`ffmpeg was killed with signal ${killSignal}`));
      else if (code) reject(new Error(`ffmpeg exited with code ${code}: ${errorOutput.trim()}`));
      else resolve();
    });
  });
