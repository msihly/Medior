import type {
  FormatEnum,
  Metadata,
  OutputInfo,
  OverlayOptions,
  ResizeOptions,
  SharpOptions,
} from "sharp";
import { runNativeTask } from "medior/utils/server/native-task";
import { workSignal } from "medior/utils/server/work-signal";

export interface ImageTask {
  composite?: OverlayOptions[];
  concurrency?: number;
  format?: keyof FormatEnum;
  input: string | Buffer;
  maxLongEdge?: number;
  maxShortEdge?: number;
  options?: SharpOptions;
  outputPath?: string;
  quality?: number;
  resize?: ResizeOptions;
  visualSize?: number;
}

export const runImageTask = (task: ImageTask, signal = workSignal.getStore()) =>
  runNativeTask<{
    decoded?: { data: Buffer; info: OutputInfo };
    metadata: Metadata;
    output?: OutputInfo;
  }>("image", task, signal);
