import { toast } from "react-toastify";

import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import duration from "dayjs/plugin/duration";
dayjs.extend(customParseFormat);
dayjs.extend(duration);
export { dayjs };

export * from "./arrays";
export * from "./constants";
export * from "./css";
export * from "./formatting";
export * from "./hooks";
export * from "./math";
export * from "./scrolling";
export * from "./videos";

/* ------------------------------- GENERAL ------------------------------- */
export const callOptFunc = (fn, ...args) => (typeof fn === "function" ? fn(...args) : fn);

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

export const parseLocalStorage = (item, defaultValue = null) => {
  const stored = localStorage.getItem(item);
  if (stored) return JSON.parse(stored);

  localStorage.setItem(item, defaultValue);
  return defaultValue;
};

export class PromiseQueue {
  queue = Promise.resolve();

  add(fn) {
    return new Promise((resolve, reject) => {
      this.queue = this.queue.then(fn).then(resolve).catch(reject);
    });
  }
}
