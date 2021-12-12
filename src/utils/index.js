import dayjs from "dayjs";
import { cloneElement, isValidElement } from "react";
import { toast } from "react-toastify";

export * from "./auth";
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

export const checkEmpty = (arr) => {
  if (arr === undefined) return console.debug("Array reference is undefined in checkEmpty(...)");
  return arr.length < 1 ? true : false;
};

export const countItems = (arr) => {
  // const map = arr.reduce((acc, cur) => acc.set(cur, (acc.get(cur) || 0) + 1), new Map());
  // return [...map.entries()];
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

/* ---------------------------------- DATES --------------------------------- */
export const mysqlDateTime = (dateStr) => dayjs(dateStr).format("YYYY-MM-DD HH:mm:ss");

/* --------------------------- FORM VALIDATION --------------------------- */
export const defaultReqs = {
  currentPassword: { name: "Current Password", type: "password", minLen: 8, maxLen: 72 },
  email: { name: "Email", isRequired: true, type: "email" },
  newPassword: { name: "New Password", type: "password", minLen: 8, maxLen: 72 },
  pageUrl: { name: "Page URL", isRequired: true, type: "url", maxLen: 2083 },
  password: { name: "Password", type: "password", minLen: 8, maxLen: 72 },
  passwordConf: { name: "Password Confirmation", type: "password", minLen: 8, maxLen: 72 },
  title: { name: "Title", isRequired: true, maxLen: 2083 },
  username: { name: "Username", minLen: 5, maxLen: 255 },
};

export const castObjectNumbers = (obj, ...objectArrayKeys) => {
  return Object.fromEntries(
    Object.entries(obj).map(([key, value]) => [
      key,
      objectArrayKeys.includes(key)
        ? value.map((e) => castObjectNumbers(e))
        : /^[+-]?\d*\.?\d+(?:[Ee][+-]?\d+)?$/.test(value)
        ? +value
        : value,
    ])
  );
};

export const objectifyFormData = (formData) =>
  castObjectNumbers(Object.fromEntries(formData.entries()));

export const emptyStringsToNull = (obj) =>
  Object.fromEntries(Object.entries(obj).map(([key, value]) => [key, value === "" ? null : value]));

export const validateForm = ({ reqs = defaultReqs, key, value }) => {
  const r = reqs[key];
  const errors = [];

  if (r?.isRequired && !value) errors.push(`${r.name} is required`);
  else if (r?.maxLen && value !== null && value.length > r.maxLen)
    errors.push(`${r.name} cannot be greater than ${r.maxLen} characters`);
  else if (r?.minLen && (value === null || value.length < r.minLen))
    errors.push(`${r.name} cannot be less than ${r.minLen} characters`);
  else if (r?.type && value !== null) {
    const { success, message } = validateInput(value, r.type);
    if (!success) errors.push(message);
  }

  return { success: errors.length === 0, message: errors.join("\n") };
};

export const validateInput = (value, type) => {
  const errors = [];

  switch (type) {
    case "date":
    case "datetime": {
      if (
        !/^([0-9]{2,4})-([0-1][0-9])-([0-3][0-9])(?:( [0-2][0-9]):([0-5][0-9]):([0-5][0-9]))?(.[0-9]{1,6})?$/.test(
          value
        )
      )
        errors.push("Invalid date");
      break;
    }
    case "decimal": {
      const v = String(value);
      if (!/^[0-9.]+$/.test(value)) errors.push("Invalid decimal number");
      else if (v.includes(".") ? v.replace(".", "").length > 10 : v.length > 8)
        errors.push("Number of type 'decimal' limited to 10 digits including 2 decimal places");
      break;
    }
    case "integer": {
      if (!/^[0-9]+$/.test(value)) errors.push("Invalid integer");
      break;
    }
    case "email": {
      if (
        // eslint-disable-next-line
        !/(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])/.test(
          value
        )
      )
        errors.push("Invalid email");
      break;
    }
    case "password": {
      if (!/[a-z]+/.test(value)) errors.push("Password requires a lowercase letter");
      else if (!/[A-Z]+/.test(value)) errors.push("Password requires an uppercase letter");
      else if (!/\d+/.test(value)) errors.push("Password requires a number");
      else if (!/[!@#$%^&]+/.test(value)) errors.push("Password requires a symbol (!@#$%^&)");
      break;
    }
    case "url": {
      if (
        // prettier-ignore
        !/^(?:(?:(?:https?|ftp):)?\/\/)(?:\S+(?::\S*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z0-9\u00a1-\uffff][a-z0-9\u00a1-\uffff_-]{0,62})?[a-z0-9\u00a1-\uffff]\.)+(?:[a-z\u00a1-\uffff]{2,}\.?))(?::\d{2,5})?(?:[/?#]\S*)?$/i.test(
          value
        )
      )
        errors.push("Invalid URL");
      break;
    }
    default:
      throw new Error("Missing 'type' argument in validate function");
  }

  return { success: errors.length === 0, message: errors.join("\n") };
};

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

/* ------------------------------ RENDERING ------------------------------ */
export const renderArrayString = (element) =>
  element.map?.((e, i) =>
    isValidElement(e) ? cloneElement(e, { key: generateRandomString() }) : e
  ) ?? element;
