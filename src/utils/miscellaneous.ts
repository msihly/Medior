import { toast } from "react-toastify";

export class PromiseQueue {
  queue = Promise.resolve();

  add(fn) {
    return new Promise((resolve, reject) => {
      this.queue = this.queue.then(fn).then(resolve).catch(reject);
    });
  }
}

export const callOptFunc = (fn, ...args) => (typeof fn === "function" ? fn(...args) : fn);

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

export const handleErrors = async <T>(
  fn: () => Promise<T>
): Promise<{ data?: T; error?: string; success: boolean }> => {
  try {
    return { success: true, data: await fn() };
  } catch (err) {
    console.error(err.stack);
    return { success: false, error: err.message };
  }
};

export const parseLocalStorage = (item, defaultValue = null) => {
  const stored = localStorage.getItem(item);
  if (stored) return JSON.parse(stored);

  localStorage.setItem(item, defaultValue);
  return defaultValue;
};
