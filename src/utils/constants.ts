import { IconName, IconProps } from "components";
import { ConnectOptions } from "mongoose";

export interface Constants {
  DRAWER_WIDTH: number;
  IMAGE_TYPES: readonly ImageType[];
  MONGOOSE_OPTS: Partial<ConnectOptions>;
  SORT_MENU_OPTS: Record<
    "COLLECTION_SEARCH" | "FILE_SEARCH" | "TAG_SEARCH",
    {
      label: string;
      attribute: string;
      icon: IconName;
      iconProps?: Partial<IconProps>;
    }[]
  >;
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
  "bmp",
  "gif",
  "heic",
  "jfif",
  "jif",
  "jiff",
  "jpeg",
  "jpg",
  "png",
  "tiff",
  "webp",
] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];

const VIDEO_TYPES = [
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
export type VideoType = (typeof VIDEO_TYPES)[number];

export const CONSTANTS: Constants = {
  DRAWER_WIDTH: 210,
  IMAGE_TYPES,
  MONGOOSE_OPTS: { family: 4 },
  SORT_MENU_OPTS: {
    COLLECTION_SEARCH: [
      { label: "Date Modified", attribute: "dateModified", icon: "DateRange" },
      { label: "Date Created", attribute: "dateCreated", icon: "DateRange" },
      { label: "File Count", attribute: "fileCount", icon: "Numbers" },
      { label: "Rating", attribute: "rating", icon: "Star" },
      { label: "Title", attribute: "title", icon: "Title" },
    ],
    FILE_SEARCH: [
      { label: "Date Modified", attribute: "dateModified", icon: "DateRange" },
      { label: "Date Created", attribute: "dateCreated", icon: "DateRange" },
      { label: "Rating", attribute: "rating", icon: "Star" },
      { label: "Size", attribute: "size", icon: "FormatSize" },
      { label: "Duration", attribute: "duration", icon: "HourglassBottom" },
      { label: "Width", attribute: "width", icon: "Height", iconProps: { rotation: 90 } },
      { label: "Height", attribute: "height", icon: "Height" },
    ],
    TAG_SEARCH: [
      { label: "Count", attribute: "count", icon: "Numbers" },
      { label: "Date Modified", attribute: "dateModified", icon: "DateRange" },
      { label: "Date Created", attribute: "dateCreated", icon: "DateRange" },
      { label: "Label", attribute: "label", icon: "Label" },
    ],
  },
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
