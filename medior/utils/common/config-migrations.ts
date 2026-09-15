export const migrateReencodeDimensions = (config: Record<string, any>) => {
  const reencode = config.file?.reencode;
  if (!reencode) return false;
  let migrated = false;
  for (const [height, width, longEdge, shortEdge, defaultLong, defaultShort] of [
    ["imageMaxHeight", "imageMaxWidth", "imageMaxLongEdge", "imageMaxShortEdge", 2560, 1440],
    ["maxHeight", "maxWidth", "maxLongEdge", "maxShortEdge", 1920, 1080],
  ] as const) {
    if (!(height in reencode || width in reencode)) continue;
    reencode[longEdge] ??= Math.max(
      reencode[width] ?? defaultLong,
      reencode[height] ?? defaultShort,
    );
    reencode[shortEdge] ??= Math.min(
      reencode[width] ?? defaultLong,
      reencode[height] ?? defaultShort,
    );
    delete reencode[height];
    delete reencode[width];
    migrated = true;
  }
  return migrated;
};
