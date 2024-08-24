import { ConnectOptions } from "mongoose";

export interface Constants {
  DRAWER_WIDTH: number;
  IMAGE_TYPES: readonly ImageType[];
  MONGOOSE_OPTS: Partial<ConnectOptions>;
  THUMB: {
    FRAME_SKIP_PERCENT: number;
    WIDTH: number;
  };
  TOP_BAR_HEIGHT: string;
  VIDEO_TYPES: readonly VideoType[];
  ZOOM: {
    MAX_SCALE: number;
    MIN_SCALE: number;
    STEP: number;
  };
}

const IMAGE_TYPES = [
  "apng",
  "avif",
  "bmp",
  "gif",
  "heic",
  "jfif",
  "jif",
  "jiff",
  "jpeg",
  "jpg",
  "png",
  "svg",
  "tiff",
  "webp",
] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];

const VIDEO_TYPES = [
  "3gp",
  "3gp2",
  "3gpp",
  "amv",
  "asf",
  "avi",
  "divx",
  "f4v",
  "flv",
  "m2t",
  "m2ts",
  "m2v",
  "m4b",
  "m4p",
  "m4v",
  "mkv",
  "mov",
  "mp4",
  "mpeg",
  "mpg",
  "mts",
  "ogv",
  "qt",
  "ts",
  "vob",
  "webm",
  "wm",
  "wmp",
  "wmv",
] as const;
export type VideoType = (typeof VIDEO_TYPES)[number];

export const PLAYABLE_VIDEO_TYPES = ["m4v", "mov", "mp4", "webm"];

export const CONSTANTS: Constants = {
  DRAWER_WIDTH: 210,
  IMAGE_TYPES,
  MONGOOSE_OPTS: { family: 4 },
  THUMB: {
    FRAME_SKIP_PERCENT: 0.03,
    WIDTH: 200,
  },
  TOP_BAR_HEIGHT: "3rem",
  VIDEO_TYPES,
  ZOOM: {
    MAX_SCALE: 5,
    MIN_SCALE: 1,
    STEP: 0.1,
  },
};
