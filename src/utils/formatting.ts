export const capitalize = (str: string, restLower = false) =>
  str[0].toUpperCase() + restLower ? str.substring(1).toLocaleLowerCase() : str.substring(1);

export const formatBytes = (bytes: number) => {
  if (bytes < 1) return "0 B";
  const power = Math.floor(Math.log2(bytes) / 10);
  return `${(bytes / 1024 ** power).toFixed(2)} ${"KMGTPEZY"[power - 1] || ""}B`;
};

export const leadZeros = (num: number, places: number) => String(num).padStart(places, "0");

export const regexEscape = (string: string) => {
  if (string === undefined)
    return console.debug("String reference is undefined in regexEscape(...)");
  return String(string).replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
};
