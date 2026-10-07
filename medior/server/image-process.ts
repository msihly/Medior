import { getOrientedSizeLimits } from "medior/utils/common/dimensions";
import type { ImageTask } from "medior/utils/server/image-task";
import { sharp } from "medior/utils/server/images";

process.on("disconnect", () => process.exit(1));

process.on("message", async ({ id, input: task }: { id: string; input: ImageTask }) => {
  try {
    let image = sharp(task.input, task.options, task.concurrency);

    const metadata = await image.metadata();

    if (task.preview || task.edit) {
      const swapsAxes = metadata.orientation >= 5 && metadata.orientation <= 8;

      if (swapsAxes) [metadata.width, metadata.height] = [metadata.height, metadata.width];

      metadata.orientation = 1;
      image.rotate();
    }

    if (task.edit?.crop) image.extract(task.edit.crop);
    else if (task.edit?.rotation) {
      // Sharp permits one rotation per pipeline; normalize orientation without an encoded copy.
      const oriented = await image.raw().toBuffer({ resolveWithObject: true });

      image = sharp(oriented.data, { raw: oriented.info }, task.concurrency).rotate(
        task.edit.rotation,
      );
    }

    if (task.comparisonSize) {
      const decoded = await image
        .rotate()
        .resize({ ...task.comparisonSize, fit: "fill" })
        .toColorspace("srgb")
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      process.send({ data: { decoded, metadata }, id });
    } else if (task.visualSize) {
      const decoded = await image
        .rotate()
        .resize(task.visualSize, task.visualSize, {
          fit: "cover",
          kernel: "cubic",
          position: "centre",
        })
        .toColorspace("srgb")
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      process.send({ data: { decoded, metadata }, id });
    } else if (task.preview) {
      const preview = await image
        .resize({ fit: "inside", height: 2048, width: 2048, withoutEnlargement: true })
        .png()
        .toBuffer();

      process.send({ data: { metadata, preview }, id });
    } else {
      if (task.maxLongEdge && task.maxShortEdge)
        image.resize({
          ...getOrientedSizeLimits(
            metadata.width,
            metadata.height,
            task.maxLongEdge,
            task.maxShortEdge,
          ),
          fit: "inside",
          withoutEnlargement: true,
        });
      else if (task.resize) image.resize(task.resize);

      if (task.composite) image.composite(task.composite);

      if (task.format === "jpg" || task.format === "jpeg") image.jpeg({ quality: task.quality });
      else if (task.format) image.toFormat(task.format, { quality: task.quality });

      const output = task.outputPath ? await image.toFile(task.outputPath) : undefined;

      process.send({ data: { metadata, output }, id });
    }
  } catch (error) {
    process.send({ error: error.message, id });
  }
});
