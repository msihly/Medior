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
      MAX_DIM: number;
    };
  };
  HOME: {
    DRAWER: { WIDTH: number };
    TOP_BAR: { HEIGHT: number };
  };
  TOOLTIP: {
    ENTER_DELAY: number;
    ENTER_NEXT_DELAY: number;
  };
  WINDOW: {
    TITLE_BAR: { HEIGHT: number };
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
      MAX_DIM: 300,
    },
  },
  HOME: {
    DRAWER: { WIDTH: 55 },
    TOP_BAR: { HEIGHT: 45 },
  },
  TOOLTIP: {
    ENTER_DELAY: 1000,
    ENTER_NEXT_DELAY: 500,
  },
  WINDOW: {
    TITLE_BAR: { HEIGHT: 32 },
  },
};
