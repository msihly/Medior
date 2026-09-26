import { getOrientedSizeLimits } from "medior/utils/common/dimensions";
import type { ImageTask } from "medior/utils/server/image-task";
import { sharp } from "medior/utils/server/images";

process.on("disconnect", () => process.exit(1));

process.on("message", async ({ id, input: task }: { id: string; input: ImageTask }) => {
  try {
    const image = sharp(task.input, task.options, task.concurrency);
    const metadata = await image.metadata();

    if (task.visualSize) {
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

      return;
    }

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
    else if (task.format) image.toFormat(task.format);

    const output = task.outputPath ? await image.toFile(task.outputPath) : undefined;

    process.send({ data: { metadata, output }, id });
  } catch (error) {
    process.send({ error: error.message, id });
  }
});
