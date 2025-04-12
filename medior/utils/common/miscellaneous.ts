import {
  cloneDeep as _cloneDeep,
  debounce as _debounce,
  isEqual as _isEqual,
  throttle as _throttle,
  toMerged as _toMerged,
} from "es-toolkit";
import { set as _set } from "es-toolkit/compat";
import { v4 as uuidv4 } from "uuid";

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

export const attempt = async <T>(fn: () => Promise<T>, retries = 2, delay = 1000): Promise<T> =>
  retries > 0
    ? await fn().catch(async (error) => {
        console.error(`Function failed, error: ${error}. Retrying after ${delay}ms...`);
        return sleep(delay).then(() => attempt(fn, retries - 1, delay));
      })
    : fn();

export const convertNestedKeys = (updates: Record<string, any>): Record<string, any> => {
  return Object.entries(updates).reduce((acc, [key, value]) => {
    key.split(".").reduce((nested, k, i, arr) => {
      return nested[k] || (nested[k] = i === arr.length - 1 ? value : {});
    }, acc);
    return acc;
  }, {});
};

export const debounce = _debounce;

export const deepClone = _cloneDeep;

export type DeepPartial<T> = { [P in keyof T]?: DeepPartial<T[P]> };

export const deepMerge = _toMerged;

export const handleErrors = async <T>(
  fn: () => Promise<T>
): Promise<{ data?: T; error?: string; success: boolean }> => {
  try {
    return { success: true, data: await fn() };
  } catch (err) {
    console.error(err);
    return { success: false, error: err.message };
  }
};

export const isDeepEqual = _isEqual;

export const isObject = (item: any): boolean =>
  item && typeof item === "object" && !Array.isArray(item);

export const rng = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

export const setObj = _set;

export const sleep = (min: number, max?: number) =>
  new Promise((resolve) => setTimeout(resolve, max > 0 ? rng(min, max) : min));

export const throttle = _throttle;

export const uuid = () => uuidv4();
