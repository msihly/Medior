import type { Config } from "medior/utils/server/config";
import { toModelLoadError } from "medior/utils/server/model-downloads";
import { registerNativeWorker } from "medior/utils/server/native-worker";

let extractor: any;
let loading: Promise<void>;
let RawImage: typeof import("@huggingface/transformers").RawImage;
let usePooledOutput = true;

registerNativeWorker(
  async (input: {
    config: Config["file"]["similarity"];
    dtype: string;
    images: Array<{ data: Uint8ClampedArray; height: number; width: number }>;
    modelId: string;
  }) => {
    loading ??= (async () => {
      // Packaged apps reach node_modules via NODE_PATH, which require follows; import() doesn't.
      const transformers: typeof import("@huggingface/transformers") = require("@huggingface/transformers");

      // Models come only from the cache unless Settings allows downloading them from Hugging Face.
      transformers.env.allowRemoteModels = input.config.modelDownloads;
      transformers.env.cacheDir = input.config.modelCachePath;
      RawImage = transformers.RawImage;

      extractor = await transformers.pipeline("image-feature-extraction", input.modelId, {
        cache_dir: input.config.modelCachePath,
        device: input.config.visual.device,
        dtype: input.dtype as Config["file"]["similarity"]["visual"]["inferenceDType"],
      });

      if (!extractor.processor?.image_processor)
        throw new Error("Visual model has no image processor.");

      extractor.processor.image_processor.do_center_crop = false;
      extractor.processor.image_processor.do_resize = false;
    })().catch((error) => {
      loading = null;

      throw toModelLoadError(error, {
        isDownloadAllowed: input.config.modelDownloads,
        modelLabel: "visual similarity",
        settingsPath: "Settings → Vectors",
      });
    });

    await loading;

    const images = input.images.map(
      (image) => new RawImage(image.data, image.width, image.height, 3),
    );

    let tensor: any;

    try {
      tensor = await extractor(images, usePooledOutput ? { pool: true } : undefined);
    } catch (error) {
      if (!String(error.message).includes("No pooled output was returned")) throw error;

      usePooledOutput = false;
      tensor = await extractor(images);
    }

    return { data: tensor.data, dims: tensor.dims };
  },
);
