import { ConnectOptions } from "mongoose";

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

export const WEB_VIDEO_CODECS = ["h264", "vp8", "vp9", "theora", "av1"];

export interface Constants {
  CAROUSEL: {
    THUMB_NAV: { WIDTH: number };
    VIDEO: { CONTROLS_HEIGHT: number };
    ZOOM: {
      MAX_SCALE: number;
      MIN_SCALE: number;
      STEP: number;
    };
  };
  FILE: {
    THUMB: {
      FRAME_SKIP_PERCENT: number;
      WIDTH: number;
    };
  };
  HOME: {
    DRAWER: { WIDTH: number };
    TOP_BAR: { HEIGHT: number };
  };
  IMAGE_TYPES: readonly ImageType[];
  MONGOOSE_OPTS: Partial<ConnectOptions>;
  VIDEO_TYPES: readonly VideoType[];
}

export const CONSTANTS: Constants = {
  CAROUSEL: {
    THUMB_NAV: { WIDTH: 135 },
    VIDEO: { CONTROLS_HEIGHT: 55 },
    ZOOM: {
      MAX_SCALE: 5,
      MIN_SCALE: 1,
      STEP: 0.025,
    },
  },
  FILE: {
    THUMB: {
      FRAME_SKIP_PERCENT: 0.03,
      WIDTH: 200,
    },
  },
  HOME: {
    DRAWER: { WIDTH: 55 },
    TOP_BAR: { HEIGHT: 55 },
  },
  IMAGE_TYPES,
  MONGOOSE_OPTS: { family: 4 },
  VIDEO_TYPES,
};
