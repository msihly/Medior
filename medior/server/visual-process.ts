import type { Config } from "medior/utils/server/config";

let extractor: any;
let loading: Promise<void>;
let RawImage: typeof import("@huggingface/transformers").RawImage;
let usePooledOutput = true;

process.on("disconnect", () => process.exit(1));

process.on(
  "message",
  async ({
    id,
    input,
  }: {
    id: string;
    input: {
      config: Config["file"]["similarity"];
      dtype: string;
      images: Array<{ data: Uint8ClampedArray; height: number; width: number }>;
      modelId: string;
    };
  }) => {
    try {
      loading ??= (async () => {
        const transformers = await import("@huggingface/transformers");

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

        throw error;
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

      process.send({ data: { data: tensor.data, dims: tensor.dims }, id });
    } catch (error) {
      process.send({ error: error.message, id });
    }
  },
);
