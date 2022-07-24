import { dayjs } from ".";

export const capitalize = (string: string) => string[0].toUpperCase() + string.substring(1);

export const formatBytes = (bytes: number) => {
  if (bytes < 1) return "0 B";
  const power = Math.floor(Math.log2(bytes) / 10);
  return `${(bytes / 1024 ** power).toFixed(2)} ${"KMGTPEZY"[power - 1] || ""}B`;
};

export const formatData = (
  data: any,
  type:
    | "boolean"
    | "currency"
    | "date"
    | "datetime"
    | "integer"
    | "percent"
    | "number"
    | "text"
    | "time"
) => {
  if (data === undefined)
    return console.debug("Undefined reference passed as 'data' argument in formatData(...)");
  if (data === null) return "N/A";

  switch (type) {
    case "boolean":
      return Boolean(data) ? "Yes" : "No";
    case "currency":
      return data.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    case "date":
    case "datetime":
    case "time":
      return dayjs(data).format();
    case "integer":
      return data.toLocaleString("en-US", { maximumFractionDigits: 0 });
    case "percent":
      return data
        .toLocaleString("en-US", {
          style: "percent",
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
        .replace("%", "");
    case "number":
    case "text":
    default:
      return data;
  }
};

export const leadZeros = (num: number, places: number) => String(num).padStart(places, "0");

export const regexEscape = (string: string) => {
  if (string === undefined)
    return console.debug("String reference is undefined in regexEscape(...)");
  return String(string).replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
};
