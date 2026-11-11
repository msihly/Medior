/**
 * The error of a model missing from the cache while downloads are off, which transformers names
 * ModelFileNotFoundError, becomes one that says where in Settings to turn downloads on. Imports
 * nothing, since native worker processes bundle it.
 */
export const toModelLoadError = (
  error: Error,
  {
    isDownloadAllowed,
    modelLabel,
    settingsPath,
  }: { isDownloadAllowed: boolean; modelLabel: string; settingsPath: string },
) =>
  !isDownloadAllowed && error.name === "ModelFileNotFoundError"
    ? new Error(
        `The ${modelLabel} model isn't in the model cache, and Model Downloads is off. Turn it on in ${settingsPath} to download it from Hugging Face.`,
      )
    : error;
