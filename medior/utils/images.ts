// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import sharpBase, { Sharp, SharpOptions } from "sharp";
import { sharpFromBmp } from "sharp-bmp";
import { CONSTANTS } from "./constants";

export const sharp = (input: string | Buffer, opts?: SharpOptions): Sharp => {
  /** Prevents WEBP lockout during deletion. See: https://github.com/lovell/sharp/issues/415#issuecomment-212817987 */
  sharpBase.cache(false);

  const isBmp =
    typeof input === "string"
      ? input.split(".").pop().toLowerCase() === "bmp"
      : input.toString("ascii", 0, 2) === "BM";

  return isBmp ? (sharpFromBmp(input, opts) as Sharp) : sharpBase(input, opts);
};

export const zoomScaleStepIn = (curZoomScale: number) =>
  Math.min(curZoomScale + CONSTANTS.CAROUSEL.ZOOM.STEP * 5, CONSTANTS.CAROUSEL.ZOOM.MAX_SCALE);

export const zoomScaleStepOut = (curZoomScale: number) =>
  Math.max(curZoomScale - CONSTANTS.CAROUSEL.ZOOM.STEP * 5, CONSTANTS.CAROUSEL.ZOOM.MIN_SCALE);
