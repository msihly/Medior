// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import duration from "dayjs/plugin/duration";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(customParseFormat);
dayjs.extend(duration);
dayjs.extend(relativeTime);

export { dayjs };

export type DayJsInput = string | number | Date | dayjs.Dayjs;

export const dateWithTzToIso = (dateStr: string) => {
  const timezone = dateStr.split(" ")[4];
  const dateWithoutTz = dateStr.replace(timezone, "").trim();
  const date = dayjs(dateWithoutTz, "ddd MMM DD HH:mm:ss YYYY");

  if (date.isValid()) {
    const hours = parseInt(timezone.slice(1, 3));
    const minutes = parseInt(timezone.slice(3));
    const offsetMinutes = (timezone[0] === "-" ? 1 : -1) * (hours * 60 + minutes);
    return date.add(offsetMinutes, "minute").toISOString();
  } else {
    console.error("Invalid date:", dateStr, date);
    return null;
  }
};
