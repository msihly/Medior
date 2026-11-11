import { createTranslator, TranslateInput } from "trabecula/utils/translation/worker";
import { toModelLoadError } from "medior/utils/server/model-downloads";
import { registerNativeWorker } from "medior/utils/server/native-worker";

const translator = createTranslator();

registerNativeWorker(async (input: TranslateInput, onProgress) => {
  try {
    return await translator.translate(input, onProgress);
  } catch (error) {
    throw toModelLoadError(error, {
      isDownloadAllowed: input.config.modelDownloads,
      modelLabel: "translation",
      settingsPath: "Settings → Files → Translation",
    });
  }
});
