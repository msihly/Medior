// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import sharpBase, { Sharp, SharpOptions } from "sharp";
import { sharpFromBmp } from "sharp-bmp";
import { CONSTANTS } from "medior/utils/common";

/** Without an input, `opts.create` makes a blank image. */
export const sharp = (input: string | Buffer, opts?: SharpOptions, concurrency?: number): Sharp => {
  /** Prevents WEBP lockout during deletion. See: https://github.com/lovell/sharp/issues/415#issuecomment-212817987 */
  sharpBase.cache(false);

  if (concurrency) sharpBase.concurrency(concurrency);

  const isBmp =
    typeof input === "string"
      ? input.split(".").pop().toLowerCase() === "bmp"
      : input?.toString("ascii", 0, 2) === "BM";

  // Sharp rejects a missing input followed by options, so `create` options are its only argument.
  if (isBmp) return sharpFromBmp(input, opts) as Sharp;
  else if (input === undefined) return sharpBase(opts);
  else return sharpBase(input, opts);
};

export const zoomScaleStepIn = (curZoomScale: number) =>
  Math.min(curZoomScale + CONSTANTS.CAROUSEL.ZOOM.STEP * 5, CONSTANTS.CAROUSEL.ZOOM.MAX_SCALE);

export const zoomScaleStepOut = (curZoomScale: number) =>
  Math.max(curZoomScale - CONSTANTS.CAROUSEL.ZOOM.STEP * 5, CONSTANTS.CAROUSEL.ZOOM.MIN_SCALE);
