import path from "path";
import {
  cloneDeep as _cloneDeep,
  debounce as _debounce,
  isEqual as _isEqual,
  throttle as _throttle,
  toMerged as _toMerged,
} from "es-toolkit";
import { set as _set } from "es-toolkit/compat";
import { toast } from "react-toastify";
import { logToFile } from "./logging";

type IsPlainObject<T> = T extends object
  ? T extends any[]
    ? false
    : T extends Function
      ? false
      : true
  : false;

export type NestedKeys<T> = {
  [K in keyof T]: K extends string
    ? IsPlainObject<T[K]> extends true
      ? K | `${K}.${NestedKeys<T[K]>}`
      : K
    : never;
}[keyof T];

export const convertNestedKeys = (updates: Record<string, any>): Record<string, any> => {
  return Object.entries(updates).reduce((acc, [key, value]) => {
    key.split(".").reduce((nested, k, i, arr) => {
      return nested[k] || (nested[k] = i === arr.length - 1 ? value : {});
    }, acc);
    return acc;
  }, {});
};

export const callOptFunc = (fn, ...args) => (typeof fn === "function" ? fn(...args) : fn);

export const copyToClipboard = (value: string, message: string) => {
  navigator.clipboard.writeText(value).then(
    () => toast.info(message),
    () => toast.error("Failed to copy to clipboard")
  );
};

export type TreeNode = { children: TreeNode[]; name: string };

const createTreeNode = (dirPath: string, tree: TreeNode[]) => {
  const dirNames = path.normalize(dirPath).split(path.sep) as string[];
  const [rootDirName, ...remainingDirNames] = dirNames;
  const treeNode = tree.find((t) => t.name === rootDirName);
  if (!treeNode) tree.push({ name: rootDirName, children: [] });
  if (remainingDirNames.length > 0)
    createTreeNode(path.join(...remainingDirNames), (treeNode ?? tree[tree.length - 1]).children);
};

export const createTree = (paths: string[]): TreeNode[] =>
  paths.reduce((acc, cur) => (createTreeNode(cur, acc), acc), []);

export const debounce = _debounce;

export const deepClone = _cloneDeep;

export type DeepPartial<T> = { [P in keyof T]?: DeepPartial<T[P]> };

export const deepMerge = _toMerged;

export const generateRandomString = () => Math.random().toString(36).substring(2, 15);

export const handleErrors = async <T>(
  fn: () => Promise<T>
): Promise<{ data?: T; error?: string; success: boolean }> => {
  try {
    return { success: true, data: await fn() };
  } catch (err) {
    logToFile("error", err.stack);
    return { success: false, error: err.message };
  }
};

export const isDeepEqual = _isEqual;

export const isObject = (item: any): boolean =>
  item && typeof item === "object" && !Array.isArray(item);

export const parseLocalStorage = (item, defaultValue = null) => {
  const stored = localStorage.getItem(item);
  if (stored) return JSON.parse(stored);

  localStorage.setItem(item, defaultValue);
  return defaultValue;
};

export const rateLimitPromiseAll = async <T>(
  rateLimit: number,
  promises: Promise<T>[]
): Promise<T[]> => {
  const generators = promises.map((promise) => () => promise);
  const iterator = generators.entries();
  const ret: T[] = [];
  let done = false;

  await Promise.all(
    Array.from(Array(rateLimit), async () => {
      for (const [idx, fn] of iterator) {
        if (done) break;
        try {
          ret[idx] = await fn();
        } catch (err) {
          done = true;
          throw err;
        }
      }
    })
  );

  return ret;
};

export const rng = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

export const setObj = _set;

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const throttle = _throttle;
