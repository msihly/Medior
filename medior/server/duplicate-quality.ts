import fs from "fs/promises";
import type { FileSchema } from "medior/_generated/server/models";
import type { getVariationSettings } from "medior/utils/common/duplicate-search";
import { getIsAnimated, getIsImage } from "medior/utils/server";
import { runImageTask } from "medior/utils/server/image-task";

export type QualityFile = Pick<
  FileSchema,
  "bitrate" | "duration" | "ext" | "height" | "id" | "path" | "size" | "videoCodec" | "width"
>;

export type VariationFile = Pick<FileSchema, "height" | "id" | "thumb" | "width">;

/** The review's variation settings, in pixels of the compared thumbnails and levels of 255. */
export type VariationSettings = ReturnType<typeof getVariationSettings>;

export interface JpegCompression {
  /** Colour detail is stored at a lower resolution than brightness, as in 4:2:0 and 4:2:2. */
  isSubsampled: boolean;
  /** Estimated quality on the familiar 1 to 100 scale, from the luminance quantization table. */
  quality: number;
}

/** The IJG luminance quantization table that quality 50 scales, the reference for estimating. */
const STANDARD_LUMINANCE_SUM = [
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56,
  14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113,
  92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99,
].reduce((sum, value) => sum + value, 0);

/**
 * How much picture each codec delivers per bit relative to H.264, from typical encoder comparisons:
 * newer codecs match its quality at a fraction of the bitrate, older and intra-frame ones need far
 * more. Codecs not listed count as H.264.
 */
const CODEC_EFFICIENCY: Record<string, number> = {
  av1: 2,
  h263: 0.6,
  h264: 1,
  hevc: 1.6,
  mjpeg: 0.3,
  mpeg1video: 0.4,
  mpeg2video: 0.5,
  mpeg4: 0.7,
  msmpeg4v3: 0.6,
  prores: 0.3,
  theora: 0.7,
  vc1: 0.8,
  vp8: 0.9,
  vp9: 1.5,
  wmv3: 0.8,
};

/** Width the watermark comparison decodes images at, enough to resolve overlaid text. */
const COMPARISON_WIDTH = 512;
const BLOCK_SIZE = 16;
/** A pixel differs when its brightness changed by more than compression noise. */
const PIXEL_DIFFERENCE = 32;
/** A block differs when this share of its pixels does. */
const BLOCK_DIFFERENCE = 0.1;
/** A watermark covers part of the image; differences beyond this share are edits, not marks. */
const MAX_WATERMARK_SHARE = 0.25;
/** How much more edge detail the marked copy needs in the differing blocks to be called so. */
const WATERMARK_EDGE_RATIO = 1.2;
/**
 * JPEGs further apart in quality are left to compression: heavy re-encoding blurs text and edges
 * the way removing an overlay would, which would mark the sharper original as watermarked.
 */
const MAX_WATERMARK_QUALITY_GAP = 10;
/** Width thumbnails are compared at, close to their stored size so local edits stay visible. */
const VARIATION_WIDTH = 256;
/**
 * Pixels are averaged in square cells before differences are taken, so the slight misalignment
 * and noise between copies resized from different sources doesn't read as change.
 */
const VARIATION_CELL_SIZE = 4;
/**
 * Colour changes count at this share of the brightness threshold, since recompression shifts
 * colour less than brightness.
 */
const VARIATION_CHROMA_SHARE = 0.8;
/**
 * Edited areas this large mark a variation, such as an inpainted hat; at least two blocks, so a
 * single noisy block never does. Marking only keeps a file out of bulk selection, so this errs
 * toward marking.
 */
const MIN_EDITED_SHARE = 0.004;
const MIN_EDITED_BLOCKS = 2;
/** Aspect ratios further apart than this share are crops or different images, never resizes. */
const MAX_ASPECT_DIFFERENCE = 0.01;

/** Reads a JPEG's quantization and frame headers, stopping before its image data. */
const readJpegCompression = async (filePath: string): Promise<JpegCompression> => {
  const handle = await fs.open(filePath, "r");

  try {
    const header = Buffer.alloc(4);
    const tableSums = new Map<number, number>();
    let frame: { isSubsampled: boolean; luminanceTableId: number } = null;
    let position = 2;

    await handle.read(header, 0, 2, 0);
    if (header[0] !== 0xff || header[1] !== 0xd8) return null;

    // Tables may follow the frame header, so reading continues until the scan.
    while (true) {
      const { bytesRead } = await handle.read(header, 0, 4, position);
      if (bytesRead < 4 || header.readUInt8(0) !== 0xff) break;

      const marker = header.readUInt8(1);
      const length = header.readUInt16BE(2);

      // Fill bytes may pad the space between segments.
      if (marker === 0xff) {
        position++;
        continue;
      }

      // Image data starts at the scan; every header the estimate needs comes before it.
      if (marker === 0xda || marker === 0xd9 || length < 2) break;

      const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);

      if (marker === 0xdb || isFrame) {
        const segment = Buffer.alloc(length - 2);
        const { bytesRead: segmentBytes } = await handle.read(
          segment,
          0,
          segment.length,
          position + 4,
        );

        // A truncated header would read as padding and look like the highest quality.
        if (segmentBytes < segment.length) return null;

        if (marker === 0xdb) {
          for (let offset = 0; offset < segment.length;) {
            const is16Bit = segment[offset] >> 4 === 1;
            const tableSize = 1 + (is16Bit ? 128 : 64);
            if (offset + tableSize > segment.length) return null;

            let sum = 0;

            for (let index = 0; index < 64; index++)
              sum += is16Bit
                ? segment.readUInt16BE(offset + 1 + index * 2)
                : segment[offset + 1 + index];

            tableSums.set(segment[offset] & 0x0f, sum);
            offset += tableSize;
          }
        } else {
          // The IJG tables the estimate compares against only describe 8-bit images.
          if (segment[0] !== 8) return null;

          const componentCount = segment[5];
          const getSampling = (index: number) =>
            (segment[7 + index * 3] >> 4) * (segment[7 + index * 3] & 0x0f);

          // The first component is brightness, quantized by the table its header names.
          frame = {
            isSubsampled: componentCount >= 3 && getSampling(0) > getSampling(1),
            luminanceTableId: segment[8],
          };
        }
      }

      position += 2 + length;
    }

    const luminanceSum = frame ? tableSums.get(frame.luminanceTableId) : undefined;
    if (luminanceSum === undefined) return null;

    // IJG scaling: below quality 50 tables grow by 5000 / quality percent, above it shrink linearly.
    const scale = (luminanceSum / STANDARD_LUMINANCE_SUM) * 100;
    const quality = scale <= 100 ? (200 - scale) / 2 : 5000 / scale;

    return {
      isSubsampled: frame.isSubsampled,
      quality: Math.round(Math.min(100, Math.max(1, quality))),
    };
  } finally {
    await handle.close();
  }
};

/** Better compression first: higher quality, then full colour detail. Non-JPEGs don't compare. */
const compareCompression = (a: JpegCompression, b: JpegCompression) =>
  a && b ? b.quality - a.quality || Number(a.isSubsampled) - Number(b.isSubsampled) : 0;

/** Which of two same-size grayscale images carries an overlay the other lacks, if either. */
const findWatermarked = (a: Uint8Array, b: Uint8Array, width: number, height: number) => {
  const columns = Math.ceil(width / BLOCK_SIZE);
  const rows = Math.ceil(height / BLOCK_SIZE);
  let changedBlocks = 0;
  let edgesA = 0;
  let edgesB = 0;

  // Horizontal and vertical brightness steps, the detail overlaid text and logos add.
  const getEdge = (pixels: Uint8Array, x: number, y: number) => {
    const index = y * width + x;

    return (
      (x + 1 < width ? Math.abs(pixels[index + 1] - pixels[index]) : 0) +
      (y + 1 < height ? Math.abs(pixels[index + width] - pixels[index]) : 0)
    );
  };

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const xEnd = Math.min(width, (column + 1) * BLOCK_SIZE);
      const yEnd = Math.min(height, (row + 1) * BLOCK_SIZE);
      let blockPixels = 0;
      let changedPixels = 0;

      for (let y = row * BLOCK_SIZE; y < yEnd; y++) {
        for (let x = column * BLOCK_SIZE; x < xEnd; x++) {
          const index = y * width + x;

          blockPixels++;

          if (Math.abs(a[index] - b[index]) > PIXEL_DIFFERENCE) changedPixels++;
        }
      }

      if (changedPixels > blockPixels * BLOCK_DIFFERENCE) {
        changedBlocks++;

        for (let y = row * BLOCK_SIZE; y < yEnd; y++) {
          for (let x = column * BLOCK_SIZE; x < xEnd; x++) {
            edgesA += getEdge(a, x, y);
            edgesB += getEdge(b, x, y);
          }
        }
      }
    }
  }

  if (!changedBlocks || changedBlocks > columns * rows * MAX_WATERMARK_SHARE) return null;
  else if (edgesA > edgesB * WATERMARK_EDGE_RATIO) return "a";
  else if (edgesB > edgesA * WATERMARK_EDGE_RATIO) return "b";
  else return null;
};

/** Averages an RGB image's pixels in square cells, smoothing resampling noise between copies. */
const getVariationCells = (pixels: Uint8Array, width: number, columns: number, rows: number) => {
  const cells = new Float32Array(columns * rows * 3);

  for (let y = 0; y < rows * VARIATION_CELL_SIZE; y++) {
    for (let x = 0; x < columns * VARIATION_CELL_SIZE; x++) {
      const pixel = (y * width + x) * 3;
      const cell =
        (Math.floor(y / VARIATION_CELL_SIZE) * columns + Math.floor(x / VARIATION_CELL_SIZE)) * 3;

      for (let channel = 0; channel < 3; channel++)
        cells[cell + channel] += pixels[pixel + channel];
    }
  }

  for (let index = 0; index < cells.length; index++)
    cells[index] /= VARIATION_CELL_SIZE * VARIATION_CELL_SIZE;

  return cells;
};

const getRgbLuma = (pixels: ArrayLike<number>, index: number) =>
  pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114;

/**
 * Maps each colour channel of an image onto a reference image's tones, so exposure, contrast,
 * gamma, and white-balance differences between copies cancel out while local edits remain.
 */
const matchTones = (reference: Uint8Array, pixels: Uint8Array) => {
  const matched = new Uint8Array(pixels.length);

  for (let channel = 0; channel < 3; channel++) {
    const counts = new Float64Array(256);
    const lookup = new Uint8Array(256);
    const referenceCounts = new Float64Array(256);
    let target = 0;

    for (let index = channel; index < pixels.length; index += 3) {
      counts[pixels[index]]++;
      referenceCounts[reference[index]]++;
    }

    for (let value = 1; value < 256; value++) {
      counts[value] += counts[value - 1];
      referenceCounts[value] += referenceCounts[value - 1];
    }

    // Each tone takes the reference tone found at the same point of the distribution.
    for (let value = 0; value < 256; value++) {
      while (target < 255 && referenceCounts[target] < counts[value]) target++;
      lookup[value] = target;
    }

    for (let index = channel; index < pixels.length; index += 3)
      matched[index] = lookup[pixels[index]];
  }

  return matched;
};

/** The brightness steps across a region of an RGB image, the detail overlaid text adds. */
const getRegionEdges = (
  pixels: Uint8Array,
  width: number,
  region: { xEnd: number; xStart: number; yEnd: number; yStart: number },
) => {
  let edges = 0;

  for (let y = region.yStart; y < region.yEnd - 1; y++) {
    for (let x = region.xStart; x < region.xEnd - 1; x++) {
      const index = (y * width + x) * 3;
      const luma = getRgbLuma(pixels, index);

      edges +=
        Math.abs(getRgbLuma(pixels, index + 3) - luma) +
        Math.abs(getRgbLuma(pixels, index + width * 3) - luma);
    }
  }

  return edges;
};

/**
 * How much of two same-size RGB images differs once their tones are matched: the share changed in
 * any way, and the blocks edited rather than overlaid. An overlay such as watermark text sharpens
 * one copy's edges without shifting its colour; edits such as an inpainted hat or changed clothing
 * replace content and colour alike.
 */
const measureDifference = (
  a: Uint8Array,
  b: Uint8Array,
  width: number,
  height: number,
  settings: VariationSettings,
) => {
  const cellsPerBlock = settings.blockSize / VARIATION_CELL_SIZE;
  const matched = matchTones(a, b);
  const cellColumns = Math.floor(width / VARIATION_CELL_SIZE);
  const cellRows = Math.floor(height / VARIATION_CELL_SIZE);
  const cellsA = getVariationCells(a, width, cellColumns, cellRows);
  const cellsB = getVariationCells(matched, width, cellColumns, cellRows);
  const blockColumns = Math.ceil(cellColumns / cellsPerBlock);
  const blockRows = Math.ceil(cellRows / cellsPerBlock);
  let changedBlocks = 0;
  let editedBlocks = 0;

  for (let blockRow = 0; blockRow < blockRows; blockRow++) {
    for (let blockColumn = 0; blockColumn < blockColumns; blockColumn++) {
      const columnEnd = Math.min(cellColumns, (blockColumn + 1) * cellsPerBlock);
      const rowEnd = Math.min(cellRows, (blockRow + 1) * cellsPerBlock);
      let blockCells = 0;
      let chromaTotal = 0;
      let lumaTotal = 0;

      for (let row = blockRow * cellsPerBlock; row < rowEnd; row++) {
        for (let column = blockColumn * cellsPerBlock; column < columnEnd; column++) {
          const cell = (row * cellColumns + column) * 3;
          const lumaA = getRgbLuma(cellsA, cell);
          const lumaB = getRgbLuma(cellsB, cell);

          blockCells++;
          lumaTotal += Math.abs(lumaA - lumaB);
          chromaTotal += Math.max(
            Math.abs(cellsA[cell] - lumaA - (cellsB[cell] - lumaB)),
            Math.abs(cellsA[cell + 2] - lumaA - (cellsB[cell + 2] - lumaB)),
          );
        }
      }

      const isRecoloured = chromaTotal / blockCells > settings.threshold * VARIATION_CHROMA_SHARE;

      if (isRecoloured || lumaTotal / blockCells > settings.threshold) {
        const region = {
          xEnd: columnEnd * VARIATION_CELL_SIZE,
          xStart: blockColumn * settings.blockSize,
          yEnd: rowEnd * VARIATION_CELL_SIZE,
          yStart: blockRow * settings.blockSize,
        };
        const edgesA = getRegionEdges(a, width, region);
        const edgesB = getRegionEdges(matched, width, region);
        const isOverlay =
          !isRecoloured &&
          (edgesA > edgesB * WATERMARK_EDGE_RATIO || edgesB > edgesA * WATERMARK_EDGE_RATIO);

        changedBlocks++;

        if (!isOverlay) editedBlocks++;
      }
    }
  }

  const blockCount = blockColumns * blockRows;

  return {
    changedShare: changedBlocks / blockCount,
    editedBlocks,
    editedShare: editedBlocks / blockCount,
  };
};

/**
 * Counts how often each image looks watermarked against same-resolution copies. Where two copies
 * differ only in a small patch, the one with more edge detail there carries the overlay.
 */
const countWatermarks = async (
  files: QualityFile[],
  compressions: Map<string, JpegCompression>,
) => {
  const counts = new Map(files.map((file) => [file.id, 0]));
  const filesBySize = new Map<string, QualityFile[]>();

  for (const file of files) {
    if (getIsImage(file.ext) && !getIsAnimated(file.ext) && file.width && file.height) {
      const key = `${file.width}x${file.height}`;

      if (!filesBySize.has(key)) filesBySize.set(key, []);
      filesBySize.get(key).push(file);
    }
  }

  for (const sameSize of filesBySize.values()) {
    if (sameSize.length < 2) continue;

    const width = Math.min(COMPARISON_WIDTH, sameSize[0].width);
    const height = Math.max(1, Math.round((sameSize[0].height * width) / sameSize[0].width));
    const pixels = new Map<string, Uint8Array>();

    // Unreadable images are left out of the comparison rather than failing the ranking.
    await Promise.all(
      sameSize.map(async (file) => {
        try {
          const { decoded } = await runImageTask({
            grayscale: { height, width },
            input: file.path,
            options: { failOn: "none" },
          });

          if (decoded.info.channels === 1) pixels.set(file.id, decoded.data);
        } catch (error) {
          console.error(`Watermark comparison skipped ${file.path}:`, error.message);
        }
      }),
    );

    for (const [index, a] of sameSize.entries()) {
      for (const b of sameSize.slice(index + 1)) {
        const qualityGap = Math.abs(
          (compressions.get(a.id)?.quality ?? 0) - (compressions.get(b.id)?.quality ?? 0),
        );
        const isComparable =
          !compressions.get(a.id) ||
          !compressions.get(b.id) ||
          qualityGap <= MAX_WATERMARK_QUALITY_GAP;

        if (isComparable && pixels.has(a.id) && pixels.has(b.id)) {
          const marked = findWatermarked(pixels.get(a.id), pixels.get(b.id), width, height);

          if (marked) {
            const markedId = marked === "a" ? a.id : b.id;

            counts.set(markedId, counts.get(markedId) + 1);
          }
        }
      }
    }
  }

  return counts;
};

/**
 * Compares each file with the kept file, marking those that look like variations rather than
 * copies: differently framed, or with any area edited rather than overlaid once tones are matched,
 * so exposure shifts and watermarks stay copies while small inpainted edits don't. Visual
 * similarity ranks layout and subject, so these can score as high as true copies. Files compared
 * by their pixels report the share of the image that differs, as a percentage. Their stored
 * thumbnails are compared one at a time; files whose thumbnails can't be read aren't marked.
 */
export const findVariations = async (
  keeper: VariationFile,
  files: VariationFile[],
  settings: VariationSettings,
) => {
  const variations = new Map<string, { difference: number | null; isVariation: boolean }>();
  const aspect = keeper.width / keeper.height;
  const height = Math.max(
    settings.blockSize,
    Math.min(VARIATION_WIDTH * 8, Math.round(VARIATION_WIDTH / aspect)),
  );

  const decode = async (file: VariationFile) => {
    if (!file.thumb?.path) return null;

    try {
      const { decoded } = await runImageTask({
        input: file.thumb.path,
        options: { failOn: "none" },
        rgb: { height, width: VARIATION_WIDTH },
      });

      return decoded.info.channels === 3 ? decoded.data : null;
    } catch (error) {
      console.error(`Variation comparison skipped ${file.thumb.path}:`, error.message);

      return null;
    }
  };

  const isKnownSize = (file: VariationFile) => file.width > 0 && file.height > 0;

  const keeperPixels = isKnownSize(keeper) ? await decode(keeper) : null;

  for (const file of files) {
    if (file.id === keeper.id || !isKnownSize(keeper) || !isKnownSize(file)) continue;

    if (Math.abs(file.width / file.height - aspect) / aspect > MAX_ASPECT_DIFFERENCE)
      variations.set(file.id, { difference: null, isVariation: true });
    else if (keeperPixels) {
      const pixels = await decode(file);

      if (pixels) {
        const { changedShare, editedBlocks, editedShare } = measureDifference(
          keeperPixels,
          pixels,
          VARIATION_WIDTH,
          height,
          settings,
        );

        variations.set(file.id, {
          difference: Math.round(changedShare * 1000) / 10,
          // Overlays only make a variation once they cover more than a watermark would.
          isVariation:
            (editedBlocks >= MIN_EDITED_BLOCKS && editedShare >= MIN_EDITED_SHARE) ||
            changedShare > MAX_WATERMARK_SHARE,
        });
      }
    }
  }

  return variations;
};

/** A JPEG's compression, or null for other formats and files that can't be read. */
export const getJpegCompression = async (filePath: string) => {
  try {
    return await readJpegCompression(filePath);
  } catch (error) {
    console.error(`JPEG quality skipped ${filePath}:`, error.message);

    return null;
  }
};

/**
 * Orders duplicates from best to worst: the most detail, then longest duration, then images
 * without a watermark their same-resolution copies have, then the less compressed JPEG, then the
 * larger file. File IDs settle any remaining tie so the order never changes between runs.
 *
 * Images hold as much detail as they have pixels. A video's detail is its resolution times its
 * bitrate, weighted by how efficiently its codec uses each bit, since an upscaled copy gains pixels
 * without detail and a re-encode loses bitrate: a slightly larger but starved copy ranks below a
 * sharper, smaller one, and an HEVC copy below an H.264 one only when it has far less bitrate.
 */
export const rankDuplicateQuality = async <File extends QualityFile>(files: File[]) => {
  const compressions = new Map(
    await Promise.all(
      files.map(async (file): Promise<[string, JpegCompression]> => [
        file.id,
        await getJpegCompression(file.path),
      ]),
    ),
  );
  const watermarks = await countWatermarks(files, compressions);

  // Compression only ranks groups of JPEGs; comparing it for some pairs and size for others
  // would make the order depend on which files happen to be compared.
  const isAllJpeg = files.every((file) => compressions.get(file.id));

  // Bitrate likewise only ranks groups of videos, measured the same way for every file in them:
  // recorded video bitrates when all have one, otherwise each file's overall data rate.
  const isAllVideo = files.every((file) => file.duration > 0);
  const hasBitrates = files.every((file) => file.bitrate > 0);

  const getDetail = (file: File) =>
    file.width *
    file.height *
    (isAllVideo
      ? (hasBitrates ? file.bitrate : file.size / file.duration) *
        (CODEC_EFFICIENCY[file.videoCodec?.toLowerCase()] ?? 1)
      : 1);

  return [...files].sort(
    (a, b) =>
      getDetail(b) - getDetail(a) ||
      (b.duration ?? 0) - (a.duration ?? 0) ||
      watermarks.get(a.id) - watermarks.get(b.id) ||
      (isAllJpeg ? compareCompression(compressions.get(a.id), compressions.get(b.id)) : 0) ||
      b.size - a.size ||
      a.id.localeCompare(b.id),
  );
};
