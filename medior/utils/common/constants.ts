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
export const WEB_VIDEO_EXTS = ["mp4", "webm", "ogv"];

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
  DB: {
    MONGOD: {
      NAME: string;
      PATH: string;
      REPLICA_SET: string;
      VERSION: string;
    };
  };
  FILE: {
    THUMB: {
      FRAME_SKIP_PERCENT: number;
      MAX_DIM: number;
    };
  };
  HOME: {
    DRAWER: { WIDTH: number };
    TOP_BAR: { HEIGHT: number };
  };
  IMAGE_TYPES: readonly ImageType[];
  MONGOOSE_OPTS: Partial<ConnectOptions>;
  PORTS: {
    DB: number;
    SERVER: number;
    SOCKET: number;
  };
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
  DB: {
    MONGOD: {
      NAME: "medior",
      PATH: "R:/mongodb/bin/mongod.exe",
      REPLICA_SET: "rs0",
      VERSION: "7.0.11",
    },
  },
  FILE: {
    THUMB: {
      FRAME_SKIP_PERCENT: 0.03,
      MAX_DIM: 300,
    },
  },
  HOME: {
    DRAWER: { WIDTH: 55 },
    TOP_BAR: { HEIGHT: 55 },
  },
  IMAGE_TYPES,
  MONGOOSE_OPTS: { family: 4 },
  PORTS: {
    DB: 27770,
    SERVER: 3567,
    SOCKET: 3568,
  },
  VIDEO_TYPES,
};
