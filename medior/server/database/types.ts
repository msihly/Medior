import { AudioCodec, ImageExt, VideoCodec, VideoExt } from "medior/utils/common";

export type { JobState, JobType } from "./jobs";
export * from "medior/_generated/server/types";

export type ImportStatus = "COMPLETE" | "DELETED" | "DUPLICATE" | "ERROR" | "PENDING";

export type FileTransformStatus =
  | "COMPLETE"
  | "COMPRESSED"
  | "DUPLICATE"
  | "ERROR"
  | "MERGED"
  | "PENDING"
  | "REPLACED"
  | "RUNNING"
  | "SAVED"
  | "SKIPPED";

export type FileTransformType = "reencode" | "remux" | "splice";

/** Whether a finished splice is saved as a new file or replaces its original. */
export type SpliceMode = "copy" | "replace";

export type SelectedAudioCodecs = { [codec in AudioCodec]: boolean };

export type SelectedImageExts = { [ext in ImageExt]: boolean };

export type SelectedVideoCodecs = { [codec in VideoCodec]: boolean };

export type SelectedVideoExts = { [ext in VideoExt]: boolean };

export interface ThumbnailNtfsMetadata {
  fileId: string;
  ntfsFileId: string;
  ntfsVolumeId: string;
  sourcePath: string;
}
