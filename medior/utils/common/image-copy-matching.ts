export interface ImageCopyOptions {
  minSimilarity: number;
  pixelTolerance: number;
}

export const IMAGE_COPY_SIZE = 256;

export const DEFAULT_IMAGE_COPY_OPTIONS: ImageCopyOptions = {
  minSimilarity: 95,
  pixelTolerance: 12,
};

export const validateImageCopyOptions = (options: ImageCopyOptions) => {
  if (
    !Number.isFinite(options.minSimilarity) ||
    options.minSimilarity < 1 ||
    options.minSimilarity > 100
  )
    throw new Error("Matching area must be between 1% and 100%.");

  if (
    !Number.isInteger(options.pixelTolerance) ||
    options.pixelTolerance < 0 ||
    options.pixelTolerance > 255
  )
    throw new Error("Pixel tolerance must be a whole number between 0 and 255.");
};

export const normalizeImageCopyPixels = (pixels: Uint8Array) => {
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const alpha = pixels[offset + 3] / 255;

    for (let channel = 0; channel < 3; channel++)
      pixels[offset + channel] = Math.round(pixels[offset + channel] * alpha);
  }

  return pixels;
};

/** Percentage of normalized pixels whose largest RGBA difference is within tolerance. */
export const compareImageCopyPixels = (a: Uint8Array, b: Uint8Array, options: ImageCopyOptions) => {
  if (a.length !== b.length || a.length !== IMAGE_COPY_SIZE * IMAGE_COPY_SIZE * 4)
    throw new Error("Unexpected image comparison dimensions.");

  const pixelCount = a.length / 4;
  const allowedDifferences = Math.floor(pixelCount * (1 - options.minSimilarity / 100) + 1e-9);
  let differences = 0;

  for (let offset = 0; offset < a.length; offset += 4) {
    if (
      Math.abs(a[offset] - b[offset]) > options.pixelTolerance ||
      Math.abs(a[offset + 1] - b[offset + 1]) > options.pixelTolerance ||
      Math.abs(a[offset + 2] - b[offset + 2]) > options.pixelTolerance ||
      Math.abs(a[offset + 3] - b[offset + 3]) > options.pixelTolerance
    )
      differences++;

    if (differences > allowedDifferences) break;
  }

  return {
    matches: differences <= allowedDifferences,
    score: (1 - differences / pixelCount) * 100,
  };
};
