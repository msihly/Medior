export * from "medior/_generated/types";
import { ImageExt, VideoCodec, VideoExt } from "medior/utils/common";

export type ImportStats = {
  completedBytes: number;
  elapsedTime: number;
  rateInBytes: number;
  totalBytes: number;
};

export type SelectedImageExts = { [ext in ImageExt]: boolean };

export type SelectedVideoCodecs = { [codec in VideoCodec]: boolean };

export type SelectedVideoExts = { [ext in VideoExt]: boolean };
