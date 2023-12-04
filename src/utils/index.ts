export { CONSTANTS } from "./constants";

export {
  arrayIntersect,
  centeredSlice,
  countItems,
  getArrayDiff,
  objectToFloat32Array,
  rotateArrayPos,
  sortArray,
  splitArray,
  sumArray,
  uniqueArrayFilter,
  uniqueArrayMerge,
} from "./arrays";

export { colors, makeClasses } from "./css";
export type { Margins, Padding } from "./css";

export { dayjs } from "./date-and-time";
export type { DayJsInput } from "./date-and-time";

export { capitalize, formatBytes, leadZeros, regexEscape } from "./formatting";

export {
  ANIMATED_EXT_REG_EXP,
  IMAGE_EXT_REG_EXP,
  IMAGE_TYPES,
  THUMB_WIDTH,
  VIDEO_EXT_REG_EXP,
  VIDEO_TYPES,
  checkFileExists,
  copyFile,
  deleteFile,
  dirToFilePaths,
  dirToFolderPaths,
  removeEmptyFolders,
} from "./files";
export type { ImageType, VideoType } from "./files";

export { useElementResize, useForceUpdate } from "./hooks";

export { logToFile, setLogDir } from "./logging";

export {
  compareLogic,
  divide,
  fractionStringToNumber,
  getRandomInt,
  round,
  stringOperators,
} from "./math";

export {
  PromiseQueue,
  callOptFunc,
  copyToClipboard,
  createTree,
  debounce,
  generateRandomString,
  handleErrors,
  parseLocalStorage,
} from "./miscellaneous";
export type { TreeNode } from "./miscellaneous";

export { useDragScroll } from "./scrolling";

export { generateFramesThumbnail, getVideoInfo } from "./videos";

export { setupSocketIO, socket, trpc } from "./trpc";
