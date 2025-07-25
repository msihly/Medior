import { dayjs, round } from "medior/utils/common";

export const abbrevNum = (num: number) =>
  Intl.NumberFormat("en", { notation: "compact" }).format(num);

export const camelCase = (str: string) => `${str[0].toLowerCase()}${str.slice(1)}`;

export const capitalize = (str: string, restLower = false) =>
  str[0].toUpperCase() + (restLower ? str.substring(1).toLocaleLowerCase() : str.substring(1));

export const commas = (num: number) => Intl.NumberFormat().format(num);

export const duration = (val: number, isMs = false) =>
  !isNaN(val) ? dayjs.duration(val, isMs ? "ms" : "s").format("HH:mm:ss") : null;

export const formatBytes = (bytes: number) => {
  if (bytes < 1) return "0 B";
  const power = Math.floor(Math.log2(bytes) / 10);
  return `${(bytes / 1024 ** power).toFixed(2)} ${"KMGTPEZY"[power - 1] || ""}B`;
};

export const frameToSec = (frame: number, frameRate: number) => round(frame / frameRate, 3);

export const leadZeros = (num: number, places: number) => String(num).padStart(places, "0");

export const regexEscape = (string: string, replacementOnly = false) =>
  string
    ? replacementOnly
      ? String(string).replace(/\\/g, "\\\\")
      : String(string).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    : string;

export const sanitizeWinPath = (winPath: string, isBasename = false): string => {
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
