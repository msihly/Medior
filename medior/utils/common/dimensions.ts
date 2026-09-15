export const getOrientedSizeLimits = (
  width: number,
  height: number,
  maxLongEdge: number,
  maxShortEdge: number,
) => ({
  height: height > width ? maxLongEdge : maxShortEdge,
  width: height > width ? maxShortEdge : maxLongEdge,
});

export const getVideoResizeFilters = (maxLongEdge: number, maxShortEdge: number) => [
  `scale='min(iw,if(gte(iw,ih),${maxLongEdge},${maxShortEdge}))':'min(ih,if(gte(iw,ih),${maxShortEdge},${maxLongEdge}))':force_original_aspect_ratio=decrease`,
  "scale='trunc(iw/2)*2':'trunc(ih/2)*2'",
  "format=yuv420p",
];
