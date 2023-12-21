import path from "path";
import { inspect } from "util";
import { toast } from "react-toastify";

export class PromiseQueue {
  queue = Promise.resolve();

  add<T>(fn: (...args: any) => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue = this.queue.then(fn).then(resolve).catch(reject);
    });
  }

  isPending() {
    return inspect(this.queue).includes("pending");
  }
}

export const callOptFunc = (fn, ...args) => (typeof fn === "function" ? fn(...args) : fn);

export const copyToClipboard = (value: string, message: string) => {
  navigator.clipboard.writeText(value).then(
    () => toast.success(message),
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

export type DeepPartial<T> = { [P in keyof T]?: DeepPartial<T[P]> };

export const deepMerge = <T>(target: T, ...sources: DeepPartial<T>[]): T => {
  if (!sources.length) return target;
  const source = sources.shift();

  if (isObject(target) && isObject(source)) {
    for (const key in source) {
      if (isObject(source[key])) {
        if (!target[key] || !isObject(target[key])) target[key] = {} as any;
        target[key] = deepMerge(target[key], source[key] as any);
      } else target[key] = source[key] as any;
    }
  }

  return deepMerge(target, ...(sources as DeepPartial<T>[]));
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

export const isObject = (item: any): boolean =>
  item && typeof item === "object" && !Array.isArray(item);

export const parseLocalStorage = (item, defaultValue = null) => {
  const stored = localStorage.getItem(item);
  if (stored) return JSON.parse(stored);

  localStorage.setItem(item, defaultValue);
  return defaultValue;
};
