import { fileLog } from "trabecula/utils/server";
import {
  getMediaProgramRankingLimitError,
  MEDIA_PROGRAM_RANKING_ASPECT_RATIOS,
  MediaProgramRankingExport,
  MediaProgramRankingTile,
} from "medior/utils/common";
import { makeAction } from "medior/utils/server";
import { runImageTask } from "medior/utils/server/image-task";
import { getScaledThumbSize } from "medior/utils/server/videos";

const BACKGROUND = { r: 18, g: 18, b: 18 };

const FONT_FAMILY = "Segoe UI, Arial, sans-serif";

/** Exports are shown on screens, so larger images are refused before they take gigabytes to draw. */
const MAX_PIXELS = 50_000_000;

/** Previews are drawn at most this wide; only a saved export needs its full size. */
const PREVIEW_WIDTH = 1600;

/** Code points of characters such as Japanese, Chinese, and Korean, about twice as wide as others. */
const WIDE_CHAR_RANGES = [
  [0x1100, 0x115f],
  [0x2e80, 0xa4cf],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe30, 0xfe4f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x20000, 0x3fffd],
];

/** The last preview's tiles by image and size, so overlay-only changes read no images again. */
let tileCache = new Map<string, Buffer>();

/* -------------------------------------------------------------------------- */
/*                              HELPER FUNCTIONS                              */
/* -------------------------------------------------------------------------- */
const escapeXml = (text: string) => text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

/** Shortens text to about the width given, as SVG text neither wraps nor truncates itself. */
const fitText = (text: string, width: number, fontSize: number) => {
  const chars = [...text];
  let fitCount = 0;
  let textWidth = 0;

  while (fitCount < chars.length) {
    textWidth += fontSize * (getIsWideChar(chars[fitCount]) ? 1 : 0.55);
    if (textWidth > width) break;

    fitCount++;
  }

  if (fitCount === chars.length) return text;

  const fitted = chars.slice(0, Math.max(1, fitCount - 1)).join("");

  return `${fitted.trimEnd()}…`;
};

const getBadgeWidth = (text: string, fontSize: number) =>
  Math.round(fontSize * (0.9 + 0.62 * text.length));

/** The tile size and image height of the grid drawn at the width and gap given. */
const getGridSize = (
  options: MediaProgramRankingExport,
  args: { gap: number; hasTitle: boolean; tileCount: number; width: number },
) => {
  const [ratioWidth, ratioHeight] = options.aspectRatio.split(":").map(Number);
  const tileWidth = Math.floor((args.width - args.gap * (options.columns + 1)) / options.columns);
  const tileHeight = Math.round((tileWidth * ratioHeight) / ratioWidth);
  const titleSize = Math.round(args.width / 24);
  const titleHeight = args.hasTitle ? Math.round(titleSize * 1.8) : 0;
  const rowCount = Math.ceil(args.tileCount / options.columns);

  return {
    height: titleHeight + args.gap + rowCount * (tileHeight + args.gap),
    tileHeight,
    tileWidth,
    titleHeight,
    titleSize,
  };
};

const getIsWideChar = (char: string) => {
  const codePoint = char.codePointAt(0);
  return WIDE_CHAR_RANGES.some(([start, end]) => codePoint >= start && codePoint <= end);
};

/**
 * Covers the tile with the image, adding it to `cache`; a video thumbnail is a grid of frames, so
 * its first is used. Images that can't be read leave the tile empty.
 */
const loadTileImage = async (
  image: MediaProgramRankingTile["image"],
  width: number,
  height: number,
  cache: Map<string, Buffer>,
) => {
  if (!image) return null;

  const key = `${image.path}|${width}x${height}`;
  const cached = tileCache.get(key);

  if (cached) {
    cache.set(key, cached);
    return cached;
  }

  try {
    const frame =
      image.frameHeight > 0 && image.frameWidth > 0
        ? getScaledThumbSize(image.frameWidth, image.frameHeight)
        : null;

    const { buffer } = await runImageTask({
      edit: frame
        ? { crop: { height: frame.height, left: 0, top: 0, width: frame.width } }
        : undefined,
      format: "png",
      input: image.path,
      resize: { fit: "cover", height, position: "attention", width },
      toBuffer: true,
      upright: true,
    });

    cache.set(key, buffer);
    return buffer;
  } catch (error) {
    fileLog(`Failed to load ranking image ${image.path}: ${error.message}`, { type: "error" });
    return null;
  }
};

const makeBadge = ({
  color,
  fontSize,
  left,
  text,
  top,
}: {
  color: string;
  fontSize: number;
  left: number;
  text: string;
  top: number;
}) => {
  const height = Math.round(fontSize * 1.6);
  const width = getBadgeWidth(text, fontSize);

  return `<rect x="${left}" y="${top}" width="${width}" height="${height}" rx="${height / 2}" fill="#000000" fill-opacity="0.7" />
    <text x="${left + width / 2}" y="${top + height / 2 + fontSize * 0.36}" font-size="${fontSize}" font-weight="700" fill="${escapeXml(color)}" text-anchor="middle">${escapeXml(text)}</text>`;
};

/* -------------------------------------------------------------------------- */
/*                                API ENDPOINTS                               */
/* -------------------------------------------------------------------------- */
/**
 * Draws the top tiles as a grid on one PNG, filling as many rows as they need. Writes the image to
 * `outputPath` when given, or else returns a smaller preview as a data URL. Also counts the tiles
 * whose images could not be read.
 */
export const renderMediaProgramRanking = makeAction(
  async ({
    options,
    outputPath,
    tiles,
    title,
  }: {
    options: MediaProgramRankingExport;
    outputPath?: string;
    tiles: MediaProgramRankingTile[];
    title: string;
  }) => {
    const limitError = getMediaProgramRankingLimitError(options);
    if (limitError) throw new Error(limitError);

    if (!MEDIA_PROGRAM_RANKING_ASPECT_RATIOS.some(({ value }) => value === options.aspectRatio))
      throw new Error("Choose a tile shape.");

    const shownTiles = tiles.slice(0, options.columns * options.rows);
    if (!shownTiles.length) throw new Error("There are no programs to export.");

    const titleText = options.showTitle ? title.trim() : "";
    const gridArgs = { hasTitle: !!titleText, tileCount: shownTiles.length };

    const fullSize = getGridSize(options, { ...gridArgs, gap: options.gap, width: options.width });
    if (fullSize.tileWidth < 40) throw new Error("The width leaves too little room for each tile.");

    if (options.width * fullSize.height > MAX_PIXELS)
      throw new Error(
        `A ${options.width}×${fullSize.height} image is too large; use fewer rows or a smaller width.`,
      );

    const scale = outputPath ? 1 : Math.min(1, PREVIEW_WIDTH / options.width);
    const width = Math.round(options.width * scale);
    const gap = Math.round(options.gap * scale);
    const { columns } = options;
    const { height, tileHeight, tileWidth, titleHeight, titleSize } =
      scale === 1 ? fullSize : getGridSize(options, { ...gridArgs, gap, width });

    const padding = Math.round(tileWidth * 0.05);
    const badgeSize = Math.max(10, Math.round(tileWidth * 0.09));
    const nameSize = Math.max(10, Math.round(tileWidth * 0.08));
    const detailsSize = Math.max(9, Math.round(nameSize * 0.8));
    const textHeight =
      (options.showName ? nameSize * 1.3 : 0) + (options.showDetails ? detailsSize * 1.3 : 0);
    const fadeHeight = textHeight ? Math.min(tileHeight, Math.round(textHeight + padding * 3)) : 0;

    const positions = shownTiles.map((_, index) => ({
      left: gap + (index % columns) * (tileWidth + gap),
      top: titleHeight + gap + Math.floor(index / columns) * (tileHeight + gap),
    }));

    const nextTileCache = new Map<string, Buffer>();
    const images = await Promise.all(
      shownTiles.map((tile) => loadTileImage(tile.image, tileWidth, tileHeight, nextTileCache)),
    );

    // Saved exports are drawn once at full size, so only preview tiles are kept.
    if (!outputPath) tileCache = nextTileCache;

    const tileElements = shownTiles.map((tile, index) => {
      const { left, top } = positions[index];
      const hasDetails = options.showDetails && !!tile.details;
      const bottom = top + tileHeight - padding;
      const elements: string[] = [];

      if (!images[index])
        elements.push(
          `<rect x="${left}" y="${top}" width="${tileWidth}" height="${tileHeight}" fill="#2a2a2a" />`,
        );

      if (fadeHeight)
        elements.push(
          `<rect x="${left}" y="${top + tileHeight - fadeHeight}" width="${tileWidth}" height="${fadeHeight}" fill="url(#fade)" />`,
        );

      if (hasDetails)
        elements.push(
          `<text x="${left + padding}" y="${bottom}" font-size="${detailsSize}" fill="#bdbdbd">${escapeXml(fitText(tile.details, tileWidth - padding * 2, detailsSize))}</text>`,
        );

      if (options.showName)
        elements.push(
          `<text x="${left + padding}" y="${hasDetails ? bottom - detailsSize * 1.3 : bottom}" font-size="${nameSize}" font-weight="600" fill="#ffffff">${escapeXml(fitText(tile.name, tileWidth - padding * 2, nameSize))}</text>`,
        );

      if (options.showRank)
        elements.push(
          makeBadge({
            color: "#ffffff",
            fontSize: badgeSize,
            left: left + padding,
            text: String(tile.rank),
            top: top + padding,
          }),
        );

      if (options.showRating && tile.rating)
        elements.push(
          makeBadge({
            color: tile.rating.color,
            fontSize: badgeSize,
            left: left + tileWidth - padding - getBadgeWidth(tile.rating.text, badgeSize),
            text: tile.rating.text,
            top: top + padding,
          }),
        );

      return elements.join("\n");
    });

    const titleElement = titleText
      ? `<text x="${width / 2}" y="${Math.round(titleHeight * 0.72)}" font-size="${titleSize}" font-weight="700" fill="#ffffff" text-anchor="middle">${escapeXml(fitText(titleText, width - gap * 2, titleSize))}</text>`
      : "";

    const overlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" font-family="${FONT_FAMILY}">
      <defs>
        <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#000000" stop-opacity="0" />
          <stop offset="1" stop-color="#000000" stop-opacity="0.85" />
        </linearGradient>
      </defs>
      ${titleElement}
      ${tileElements.join("\n")}
    </svg>`;

    const result = await runImageTask({
      composite: [
        ...images.flatMap((buffer, index) =>
          buffer ? [{ input: buffer, ...positions[index] }] : [],
        ),
        { input: Buffer.from(overlay), left: 0, top: 0 },
      ],
      format: "png",
      options: { create: { background: BACKGROUND, channels: 3, height, width } },
      outputPath,
      toBuffer: !outputPath,
    });

    return {
      dataUrl: outputPath ? null : `data:image/png;base64,${result.buffer.toString("base64")}`,
      failedCount: shownTiles.filter((tile, index) => tile.image && !images[index]).length,
    };
  },
);
