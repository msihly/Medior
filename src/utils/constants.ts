import { dayjs } from ".";
export type DayJsInput = string | number | Date | dayjs.Dayjs;

export const FILE_COUNT = 21;
export const MONGOOSE_OPTS = { family: 4, minPoolSize: 50, maxPoolSize: 500 };
