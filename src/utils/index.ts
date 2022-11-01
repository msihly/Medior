import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import duration from "dayjs/plugin/duration";
dayjs.extend(customParseFormat);
dayjs.extend(duration);
export { dayjs };

export * from "./arrays";
export * from "./css";
export * as $C from "./constants";
export * from "./date-and-time";
export * from "./formatting";
export * from "./hooks";
export * from "./math";
export * from "./miscellaneous";
export * from "./scrolling";
export * from "./videos";
