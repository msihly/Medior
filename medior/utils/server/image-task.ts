import { execFile } from "child_process";
import type {
  FormatEnum,
  Metadata,
  OutputInfo,
  OverlayOptions,
  Region,
  ResizeOptions,
  SharpOptions,
} from "sharp";
import { serverShutdownSignal } from "medior/server/process-lifecycle";
import { runNativeTask } from "medior/utils/server/native-task";
import { workSignal } from "medior/utils/server/work-signal";

export interface ImageTask {
  composite?: OverlayOptions[];
  concurrency?: number;
  edit?: { crop?: Region; rotation?: number };
  format?: keyof FormatEnum;
  input: string | Buffer;
  maxLongEdge?: number;
  maxShortEdge?: number;
  options?: SharpOptions;
  outputPath?: string;
  preview?: boolean;
  quality?: number;
  resize?: ResizeOptions;
  visualSize?: number;
}

export interface ImageTaskResult {
  decoded?: { data: Buffer; info: OutputInfo };
  metadata: Metadata;
  output?: OutputInfo;
  preview?: Buffer;
}

export const runImageTask = async (
  task: ImageTask,
  signal = workSignal.getStore() ?? serverShutdownSignal,
): Promise<ImageTaskResult> => {
  try {
    return await runNativeTask<ImageTaskResult>("image", task, signal);
  } catch (error) {
    signal.throwIfAborted();

    if (
      typeof task.input !== "string" ||
      !/heif: Unsupported feature: Unsupported codec/i.test(error.message)
    )
      throw error;

    const input = await new Promise<Buffer>((resolve, reject) => {
      execFile(
        process.env.FFMPEG_PATH || "ffmpeg",
        [
          "-v",
          "error",
          "-nostdin",
          "-i",
          task.input as string,
          "-map",
          "0:v:0",
          "-frames:v",
          "1",
          "-c:v",
          "png",
          "-f",
          "image2pipe",
          "pipe:1",
        ],
        { encoding: "buffer", maxBuffer: 256 * 1024 * 1024, signal, windowsHide: true },
        (decodeError, stdout) => {
          if (decodeError) reject(decodeError);
          else resolve(stdout);
        },
      );
    });

    return runNativeTask<ImageTaskResult>("image", { ...task, input }, signal);
  }
};
