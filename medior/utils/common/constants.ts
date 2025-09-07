import { ConnectOptions } from "mongoose";

export const AUDIO_CODECS_COMMON = [
  "None",
  "aac_he",
  "aac_ld",
  "aac",
  "ac3",
  "aiff",
  "alac",
  "avc",
  "dts",
  "flac",
  "mp2",
  "mp3",
  "mp4als",
  "opus",
  "pcm_alaw",
  "pcm_bluray",
  "pcm_dvd",
  "pcm_s16be",
  "pcm_s16le",
  "pcm_s24le",
  "pcm_s32le",
  "pcm_u8",
  "pcm",
  "tta",
  "vorbis",
  "wav",
  "wmapro",
  "wmav1",
  "wmav2",
] as const;

export const AUDIO_CODECS_UNCOMMON = [
  "aac_latm",
  "alac",
  "ape",
  "aptx_hd",
  "aptx",
  "avs",
  "binkaudio_dct",
  "binkaudio_rdft",
  "cavs",
  "cook",
  "hcom",
  "iac",
  "mace3",
  "mace6",
  "paf_audio",
  "ra_144",
  "ra_288",
  "ralf",
  "sipr",
  "tak",
  "westwood_snd1",
  "wmalossless",
  "wmavoice",
  "xma1",
  "xma2",
] as const;

export const AUDIO_CODECS = [...AUDIO_CODECS_COMMON, ...AUDIO_CODECS_UNCOMMON] as const;
export type AudioCodec = (typeof AUDIO_CODECS)[number];

export const IMAGE_EXTS_COMMON = ["gif", "heic", "jpeg", "jpg", "png", "webp"] as const;

export const IMAGE_EXTS_UNCOMMON = [
  "apng",
  "avif",
  "bmp",
  "jfif",
  "jif",
  "jiff",
  "svg",
  "tiff",
] as const;

export const IMAGE_EXTS = [...IMAGE_EXTS_COMMON, ...IMAGE_EXTS_UNCOMMON];
export type ImageExt = (typeof IMAGE_EXTS)[number];

export const VIDEO_CODECS_COMMON = [
  "av1",
  "h264",
  "hevc",
  "mpeg4",
  "prores",
  "vp8",
  "vp9",
  "wmv1",
] as const;

export const VIDEO_CODECS_UNCOMMON = [
  "amv",
  "asv1",
  "asv2",
  "auravision",
  "binkvideo",
  "camstudio",
  "cinepak",
  "dirac",
  "dnxhd",
  "dnxhr",
  "dvvideo",
  "ffv1",
  "flv1",
  "h263",
  "h263p",
  "huffyuv",
  "indeo3",
  "indeo5",
  "jpeg2000",
  "jpegls",
  "lagarith",
  "mjpeg",
  "mjpegb",
  "mpeg1video",
  "mpeg2video",
  "msmpeg4v1",
  "msmpeg4v2",
  "msmpeg4v3",
  "rawvideo",
  "rv10",
  "rv20",
  "rv30",
  "rv40",
  "smacker",
  "snow",
  "sp5x",
  "svq1",
  "svq3",
  "theora",
  "tscc",
  "utvideo",
  "uyvy422",
  "v210",
  "vixl",
  "vp6",
  "vp6f",
  "wmv2",
  "wmv3",
  "yuyv422",
  "zlib",
  "zmbv",
] as const;

export const VIDEO_CODECS = [...VIDEO_CODECS_COMMON, ...VIDEO_CODECS_UNCOMMON] as const;
export type VideoCodec = (typeof VIDEO_CODECS)[number];

export const VIDEO_EXTS_COMMON = [
  "3gp",
  "avi",
  "f4v",
  "flv",
  "m4v",
  "mkv",
  "mov",
  "mp4",
  "ts",
  "webm",
  "wmv",
] as const;

export const VIDEO_EXTS_UNCOMMON = [
  "3gp2",
  "3gpp",
  "amv",
  "asf",
  "avi",
  "divx",
  "m2t",
  "m2ts",
  "m2v",
  "m4b",
  "m4p",
  "mpeg",
  "mpg",
  "mts",
  "ogv",
  "qt",
  "vob",
  "wm",
  "wmp",
] as const;

export const VIDEO_EXTS = [...VIDEO_EXTS_COMMON, ...VIDEO_EXTS_UNCOMMON];
export type VideoExt = (typeof VIDEO_EXTS)[number];

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
  IMAGE_EXTS: readonly ImageExt[];
  MONGOOSE_OPTS: Partial<ConnectOptions>;
  PORTS: {
    DB: number;
    SERVER: number;
    SOCKET: number;
  };
  VIDEO_CODECS: readonly VideoCodec[];
  VIDEO_EXTS: readonly VideoExt[];
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
  IMAGE_EXTS,
  MONGOOSE_OPTS: { family: 4 },
  PORTS: {
    DB: 27770,
    SERVER: 3567,
    SOCKET: 3568,
  },
  VIDEO_CODECS,
  VIDEO_EXTS,
};
