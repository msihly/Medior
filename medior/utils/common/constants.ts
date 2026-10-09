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
    IO_CONCURRENCY: number;
    TAG_QUERY_BATCH_SIZE: number;
    THUMB: {
      FRAME_SKIP_PERCENT: number;
      GRID_COLUMNS: number;
      GRID_ROWS: number;
      MAX_DIM: number;
      NTFS_BATCH_SIZE: number;
      NTFS_CONCURRENCY: number;
    };
    TRANSFORM: {
      BATCH_SIZE: number;
      PREVIEW_INTERVAL_MS: number;
    };
  };
  HOME: {
    DRAWER: { WIDTH: number };
    TOP_BAR: { HEIGHT: number };
  };
  VECTOR: {
    DEFAULT_THREAD_POOL_SIZE: number;
    MAX_SIMILAR_RESULTS: number;
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
    IO_CONCURRENCY: 32,
    TAG_QUERY_BATCH_SIZE: 1000,
    THUMB: {
      FRAME_SKIP_PERCENT: 0.03,
      GRID_COLUMNS: 3,
      GRID_ROWS: 3,
      MAX_DIM: 300,
      NTFS_BATCH_SIZE: 1000,
      NTFS_CONCURRENCY: 32,
    },
    TRANSFORM: {
      BATCH_SIZE: 1000,
      PREVIEW_INTERVAL_MS: 500,
    },
  },
  HOME: {
    DRAWER: { WIDTH: 55 },
    TOP_BAR: { HEIGHT: 45 },
  },
  VECTOR: {
    DEFAULT_THREAD_POOL_SIZE: 4,
    MAX_SIMILAR_RESULTS: 1000,
  },
  WINDOW: {
    TITLE_BAR: { HEIGHT: 32, Z_INDEX: 1401 },
  },
};

// Archive and path predicates lead; the remaining keys cover IDs and date sorting.
export const FILE_PATH_SEARCH_INDEX = {
  isArchived: 1,
  originalPath: 1,
  _id: 1,
  dateCreated: 1,
  dateImported: 1,
  dateModified: 1,
} as const;
