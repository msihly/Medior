export interface DuplicateSearchOptions {
  minSimilarity: number;
}

export const DEFAULT_DUPLICATE_SEARCH_OPTIONS: DuplicateSearchOptions = { minSimilarity: 95 };

export const DUPLICATE_PAGE_SIZE = 10;

export const MIN_DUPLICATE_SIMILARITY = 80;

export const validateDuplicateSearchOptions = (options: DuplicateSearchOptions) => {
  if (
    !Number.isFinite(options.minSimilarity) ||
    options.minSimilarity < MIN_DUPLICATE_SIMILARITY ||
    options.minSimilarity > 100
  )
    throw new Error(`Similarity must be between ${MIN_DUPLICATE_SIMILARITY}% and 100%.`);
};
