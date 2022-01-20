import { toast } from "react-toastify";

export * from "./hooks";
export * from "./makeStyles";

/* ------------------------------- GENERAL ------------------------------- */
export const makeClassName = (...classNames) =>
  classNames.filter((c) => ![undefined, null, false, ""].includes(c)).join(" ");

export const callOptFunc = (fn, ...args) => (typeof fn === "function" ? fn(...args) : fn);

export const capitalize = (string) => string[0].toUpperCase() + string.substring(1);

export const compareLogic = (type, ...items) =>
  type === "and"
    ? items.every(Boolean)
    : type === "or"
    ? items.some(Boolean)
    : "Missing type parameter";

export const copyToClipboard = (value, message) => {
  navigator.clipboard.writeText(value).then(
    () => toast.success(message),
    () => toast.error("Failed to copy to clipboard")
  );
};

export const debounce = (fn, delay) => {
  let timeout;
  return (...args) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => {
      fn(...args);
      timeout = null;
    }, delay);
  };
};

export const generateRandomString = () => Math.random().toString(36).substring(2, 15);

export const getRandomInt = (min, max, cur = null) => {
  let num = Math.floor(Math.random() * (max - min + 1)) + min;
  return num === cur ? getRandomInt(min, max, cur) : num;
};

export const parseLocalStorage = (item, defaultValue = null) => {
  const stored = localStorage.getItem(item);
  if (stored) return JSON.parse(stored);

  localStorage.setItem(item, defaultValue);
  return defaultValue;
};

export const regexEscape = (string) => {
  if (string === undefined)
    return console.debug("String reference is undefined in regexEscape(...)");
  return String(string).replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
};

/* -------------------------------- ARRAYS ------------------------------- */
export const arrayIntersect = (...arrays) =>
  [...arrays].reduce((acc, cur) => acc.filter((e) => cur.includes(e)));

export const countItems = (arr) => {
  const map = arr.reduce((acc, cur) => {
    const group = acc.find((e) => e.value === cur);
    if (!group) acc.push({ value: cur, count: 1 });
    else group.count += 1;
    return acc;
  }, []);

  return sortArray(map, "count", true, true);
};

export const getArrayDiff = (a, b) =>
  a.filter((e) => !b.includes(e)).concat(b.filter((e) => !a.includes(e)));

export const rotateArrayPos = (direction, current, length) => {
  if (direction === "next") {
    return current + 1 < length ? current + 1 : 0;
  } else if (direction === "prev") {
    return current - 1 >= 0 ? current - 1 : length - 1;
  }
};

export const sortArray = (arr, key, isDesc = true, isNumber = false) => {
  if (arr === undefined) {
    console.debug("Array reference is undefined in sortArray(...)");
    return [];
  }
  if (!arr?.length) return [];

  const sorted = [...arr];

  sorted.sort((a, b) => {
    const first = a[key] ?? (isNumber ? 0 : "");
    const second = b[key] ?? (isNumber ? 0 : "");

    const comparison = isNumber ? second - first : String(second).localeCompare(String(first));
    return isDesc ? comparison : comparison * -1;
  });

  return sorted;
};

export const splitArray = (arr, filterFn) =>
  // eslint-disable-next-line
  arr.reduce((acc, cur) => (acc[+!filterFn(cur)].push(cur), acc), [[], []]);

export const sumArray = (arr, fn) => arr.reduce((acc, cur) => (acc += fn?.(cur) ?? cur), 0);

export const uniqueArrayFilter = (...arrays) => {
  const all = [].concat(...arrays);
  const nonUnique = all.filter(
    (
      (set) => (value) =>
        set.has(value) || !set.add(value)
    )(new Set())
  );
  return all.filter((e) => !nonUnique.includes(e));
};

export const uniqueArrayMerge = (oldArray, newArrays) => [
  ...new Set([...new Set(oldArray), ...[].concat(...newArrays)]),
];

/* ------------------------------ FORMATTING ----------------------------- */
export const formatBytes = (bytes) => {
  if (bytes < 1) {
    return "0 B";
  }
  const power = Math.floor(Math.log2(bytes) / 10);
  return `${(bytes / 1024 ** power).toFixed(2)} ${"KMGTPEZY"[power - 1] || ""}B`;
};

export const formatData = (data, type) => {
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
      return data; // update to dayjs
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

export const leadZeros = (num, places) => String(num).padStart(places, "0");

/* ---------------------------------- MATH ---------------------------------- */
export const divide = (...nums) =>
  nums.length > 0 ? nums.reduce((acc, cur) => (acc /= cur)) || 0 : null;

export const stringOperators = (operator, a, b) => {
  switch (operator) {
    case ">":
      return a > b;
    case ">=":
      return a >= b;
    case "<":
      return a < b;
    case "<=":
      return a <= b;
    case "=":
      return a === b;
    case "!=":
      return a !== b;
    default:
      return false;
  }
};
