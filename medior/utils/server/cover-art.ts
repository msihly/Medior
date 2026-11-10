import { PassThrough } from "node:stream";
import Color, { ColorInstance } from "color";
import { runFfmpeg } from "./ffmpeg";
import { sharp } from "./images";

/** How vivid a cover's accent is at least, as the spread between its RGB channels. */
const MIN_ACCENT_CHROMA = 0.3;
/** How much of a cover its accent covers at least, so specks of color never count. */
const MIN_ACCENT_SHARE = 0.005;
/** How far apart, in RGB, two of a cover's dominant colors are at least. */
const MIN_COLOR_DISTANCE = 64;
/** The side the cover is shrunk to before its colors are counted, which keeps that quick. */
const SAMPLE_SIZE = 64;

/**
 * A cover's most common colors, most common first, leaving out any too close to one before it,
 * and its accent: its most vivid color, weighing vividness over how much of the cover it covers.
 * Covers without a vivid color have no accent. Pixels are counted in groups of similar colors,
 * each giving the average of its pixels.
 */
export const getCoverColors = async (cover: Buffer, count: number) => {
  const { data, info } = await sharp(cover)
    .resize(SAMPLE_SIZE, SAMPLE_SIZE, { fit: "inside" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const groups = new Map<number, { b: number; count: number; g: number; r: number }>();

  for (let index = 0; index < data.length; index += info.channels) {
    const [r, g, b] = [data[index], data[index + 1], data[index + 2]];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const group = groups.get(key) ?? { b: 0, count: 0, g: 0, r: 0 };

    group.b += b;
    group.count++;
    group.g += g;
    group.r += r;
    groups.set(key, group);
  }

  const pixelCount = data.length / info.channels;
  const swatches = [...groups.values()]
    .sort((a, b) => b.count - a.count)
    .map((group) => ({
      color: Color.rgb(group.r / group.count, group.g / group.count, group.b / group.count),
      share: group.count / pixelCount,
    }));

  const dominant: ColorInstance[] = [];

  for (const { color } of swatches) {
    const isDistinct = dominant.every(
      (other) =>
        Math.hypot(
          other.red() - color.red(),
          other.green() - color.green(),
          other.blue() - color.blue(),
        ) >= MIN_COLOR_DISTANCE,
    );

    if (isDistinct) dominant.push(color);
    if (dominant.length === count) break;
  }

  let accent: ColorInstance = null;
  let accentScore = 0;

  for (const { color, share } of swatches) {
    const channels = [color.red(), color.green(), color.blue()];
    const chroma = (Math.max(...channels) - Math.min(...channels)) / 255;
    const score = chroma * Math.sqrt(share);

    if (share >= MIN_ACCENT_SHARE && chroma >= MIN_ACCENT_CHROMA && score > accentScore) {
      accent = color;
      accentScore = score;
    }
  }

  return { accent: accent?.hex() ?? null, dominant: dominant.map((color) => color.hex()) };
};

/** An audio file's cover art at its own size, unlike its thumbnail, as a PNG. */
export const readCoverArt = async (filePath: string, signal: AbortSignal) => {
  const chunks: Buffer[] = [];
  const output = new PassThrough();

  output.on("data", (chunk: Buffer) => chunks.push(chunk));
  await runFfmpeg(
    [
      "-i",
      filePath,
      "-map",
      "0:v:0",
      "-frames:v",
      "1",
      "-vcodec",
      "png",
      "-f",
      "image2pipe",
      "pipe:1",
    ],
    { signal, stdout: output },
  );

  if (!chunks.length) throw new Error("The track's cover art couldn't be read.");

  return Buffer.concat(chunks);
};
