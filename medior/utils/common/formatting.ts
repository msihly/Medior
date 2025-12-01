import { dayjs, round } from "medior/utils/common";

const abbrevNum = (num: number) => Intl.NumberFormat("en", { notation: "compact" }).format(num);

const bytes = (bytes: number) => {
  if (bytes < 1) return "0 B";
  const power = Math.floor(Math.log2(bytes) / 10);
  return `${(bytes / 1024 ** power).toFixed(2)} ${"KMGTPEZY"[power - 1] || ""}B`;
};

const camelCase = (str: string) => `${str[0].toLowerCase()}${str.slice(1)}`;

const capitalize = (str: string, restLower = false) =>
  str[0].toUpperCase() + (restLower ? str.substring(1).toLocaleLowerCase() : str.substring(1));

const commas = (num: number) => Intl.NumberFormat().format(num);

const duration = (val: number, isMs = false) =>
  !isNaN(val) ? dayjs.duration(val, isMs ? "ms" : "s").format("HH:mm:ss") : null;

const frameToSec = (frame: number, frameRate: number) => round(frame / frameRate, 3);

const jstr = (val: any) => JSON.stringify(val, null, 2);

const leadZeros = (num: number, places: number) => String(num).padStart(places, "0");

const regexEscape = (string: string, replacementOnly = false) =>
  string
    ? replacementOnly
      ? String(string).replace(/\\/g, "\\\\")
      : String(string).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    : string;

const sanitizeWinPath = (winPath: string, isBasename = false): string => {
  if (!winPath) return winPath;

  const sanitize = (part: string) =>
    part
      .replace(/[\\:*?"<>|]/g, "-")
      .replace(/[. ]+$/, "")
      .replace(isBasename ? "/" : "", "")
      .trim();

  return isBasename
    ? sanitize(winPath)
    : winPath
        .split(/[/\\]/)
        .map((part, idx) => (idx === 0 && /^[a-zA-Z]:$/.test(part) ? part : sanitize(part)))
        .join("\\");
};

export const Fmt = {
  abbrevNum,
  bytes,
  camelCase,
  capitalize,
  commas,
  duration,
  frameToSec,
  jstr,
  leadZeros,
  regexEscape,
  sanitizeWinPath,
};
