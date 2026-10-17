/** Review settings for grouping a search's stored matches; the search itself ignores them. */
export interface DuplicateSearchOptions {
  /** JSON of the filter last searched in the filter menu, which every grouped file must pass. */
  filter: string | null;
  minSimilarity: number;
  /** JSON of the filter menu's settings when it was searched, restoring the menu on reopening. */
  searchProps: string | null;
  /**
   * Minutes around each grouped file's date created within which other files are listed beside
   * its group, without affecting similarity; null turns this off.
   */
  timeWindow: number | null;
  /**
   * Side of the square areas, in pixels of the 256-pixel-wide thumbnails compared, that changes
   * are measured in when marking variations. Smaller areas catch smaller edits.
   */
  variationBlockSize: number;
  /**
   * How far, out of 255, an area's average brightness must change after tones are matched to
   * count as changed when marking variations. Lower values catch subtler edits.
   */
  variationThreshold: number;
}

export const DEFAULT_DUPLICATE_SEARCH_OPTIONS: DuplicateSearchOptions = {
  filter: null,
  minSimilarity: 95,
  searchProps: null,
  timeWindow: null,
  variationBlockSize: 16,
  variationThreshold: 10,
};

export const DUPLICATE_PAGE_SIZE = 20;

export const MAX_DUPLICATE_TIME_WINDOW = 7 * 24 * 60;

export const MAX_VARIATION_BLOCK_SIZE = 64;

export const MAX_VARIATION_THRESHOLD = 64;

/** The lowest similarity a search stores, and so the lowest the review can show. */
export const MIN_DUPLICATE_SIMILARITY = 90;

export const MIN_VARIATION_BLOCK_SIZE = 8;

export const MIN_VARIATION_THRESHOLD = 1;

/** Variation areas are whole numbers of the 4-pixel cells noise is averaged in. */
export const VARIATION_BLOCK_STEP = 4;

/** Searches saved before the variation settings existed use the defaults. */
export const getVariationSettings = (options: Partial<DuplicateSearchOptions>) => ({
  blockSize: options.variationBlockSize ?? DEFAULT_DUPLICATE_SEARCH_OPTIONS.variationBlockSize,
  threshold: options.variationThreshold ?? DEFAULT_DUPLICATE_SEARCH_OPTIONS.variationThreshold,
});

/** A null window turns listing nearby files off. */
export const validateDuplicateTimeWindow = (timeWindow: number | null) => {
  if (
    timeWindow !== null &&
    (!Number.isFinite(timeWindow) || timeWindow <= 0 || timeWindow > MAX_DUPLICATE_TIME_WINDOW)
  )
    throw new Error(
      `The date created window must be between 1 and ${MAX_DUPLICATE_TIME_WINDOW} minutes.`,
    );
};

export const validateDuplicateSearchOptions = (options: DuplicateSearchOptions) => {
  if (
    !Number.isFinite(options.minSimilarity) ||
    options.minSimilarity < MIN_DUPLICATE_SIMILARITY ||
    options.minSimilarity > 100
  )
    throw new Error(`Similarity must be between ${MIN_DUPLICATE_SIMILARITY}% and 100%.`);

  validateDuplicateTimeWindow(options.timeWindow);

  const { blockSize, threshold } = getVariationSettings(options);

  if (
    !Number.isInteger(blockSize) ||
    blockSize % VARIATION_BLOCK_STEP !== 0 ||
    blockSize < MIN_VARIATION_BLOCK_SIZE ||
    blockSize > MAX_VARIATION_BLOCK_SIZE
  )
    throw new Error(
      `The variation block size must be a multiple of ${VARIATION_BLOCK_STEP} between ${MIN_VARIATION_BLOCK_SIZE} and ${MAX_VARIATION_BLOCK_SIZE} pixels.`,
    );

  if (
    !Number.isFinite(threshold) ||
    threshold < MIN_VARIATION_THRESHOLD ||
    threshold > MAX_VARIATION_THRESHOLD
  )
    throw new Error(
      `The variation threshold must be between ${MIN_VARIATION_THRESHOLD} and ${MAX_VARIATION_THRESHOLD}.`,
    );
};
