export * from "medior/_generated/types";
import { ImageType, VideoType } from "medior/utils";


export type ImportStats = {
  completedBytes: number;
  elapsedTime: number;
  rateInBytes: number;
  totalBytes: number;
};

export type SelectedImageTypes = { [ext in ImageType]: boolean };

export type SelectedVideoTypes = { [ext in VideoType]: boolean };
