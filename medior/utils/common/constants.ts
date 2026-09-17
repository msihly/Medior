import { _CONSTANTS, _Constants } from "trabecula/utils/common";

export interface Constants extends _Constants {
  CAROUSEL: {
    THUMB_NAV: { WIDTH: number };
    TOP_BAR: { BACKGROUND: string };
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
      GRID_COLUMNS: number;
      GRID_ROWS: number;
      MAX_DIM: number;
      NTFS_BATCH_SIZE: number;
      NTFS_CONCURRENCY: number;
    };
    TRANSFORM: { BATCH_SIZE: number; REGEN_INTERVAL_MS: number };
  };
  HOME: {
    DRAWER: { WIDTH: number };
    TOP_BAR: { HEIGHT: number };
  };
  TOOLTIP: {
    ENTER_DELAY: number;
    ENTER_NEXT_DELAY: number;
  };
  VECTOR: {
    DEFAULT_THREAD_POOL_SIZE: number;
    MAX_IO_CONCURRENCY: number;
  };
  WINDOW: {
    TITLE_BAR: { HEIGHT: number; Z_INDEX: number };
  };
}

export const CONSTANTS: Constants = {
  ..._CONSTANTS,
  CAROUSEL: {
    THUMB_NAV: { WIDTH: 135 },
    TOP_BAR: { BACKGROUND: "rgb(0 0 0 / 0.5)" },
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
      GRID_COLUMNS: 3,
      GRID_ROWS: 3,
      MAX_DIM: 300,
      NTFS_BATCH_SIZE: 1000,
      NTFS_CONCURRENCY: 32,
    },
    TRANSFORM: { BATCH_SIZE: 1000, REGEN_INTERVAL_MS: 5 * 60 * 1000 },
  },
  HOME: {
    DRAWER: { WIDTH: 55 },
    TOP_BAR: { HEIGHT: 45 },
  },
  TOOLTIP: {
    ENTER_DELAY: 1000,
    ENTER_NEXT_DELAY: 500,
  },
  VECTOR: {
    DEFAULT_THREAD_POOL_SIZE: 4,
    MAX_IO_CONCURRENCY: 32,
  },
  WINDOW: {
    TITLE_BAR: { HEIGHT: 32, Z_INDEX: 1401 },
  },
};
