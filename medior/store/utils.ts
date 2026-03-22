import { _async, _await, getSnapshot, isTreeNode, onPatches, prop } from "mobx-keystone";
import { handleErrors } from "medior/utils/common";

export const asyncAction = <ThisArg, Output, Input>(fn: (input: Input) => Promise<Output>) => {
  return _async(function* (this: ThisArg, input?: Input) {
    if (typeof fn !== "function") throw new Error("Provided function is not a function");

    const boundFn = fn.bind(this);
    if (typeof boundFn !== "function") throw new Error("Bound function is not a function");

    return yield* _await(handleErrors<Output>(() => boundFn(input!)));
  });
};

export const attachTouchedTracker = <T extends { _touched: Record<string, boolean> }>(model: T) => {
  onPatches(model as any, (patches) => {
    const touched = model._touched;

    for (const p of patches) {
      if (p.path.length !== 1) continue;
      const key = p.path[0] as string;
      if (key === "_touched") continue;
      if (touched[key]) continue;
      touched[key] = true;
    }
  });
};

export const clearTouched = <T extends { _touched: Record<string, boolean> }>(model: T, keys: string[]) => {
  for (const k of keys) model._touched[k] = false;
};

export const derefMobx = (value: any) => {
  if (value === null || typeof value !== "object") return value;
  if (isTreeNode(value)) return getSnapshot(value);

  if (Array.isArray(value)) {
    const len = value.length;
    let changed = false;
    const out = new Array(len);

    for (let i = 0; i < len; i++) {
      const v = derefMobx(value[i]);
      if (v !== value[i]) changed = true;
      out[i] = v;
    }

    return changed ? out : value;
  }

  let changed = false;
  const out = {};

  for (const k in value) {
    const v = derefMobx(value[k]);
    if (v !== value[k]) changed = true;
    out[k] = v;
  }

  return changed ? out : value;
};

export const makeTouchedProp = () => ({
  _touched: prop<Partial<Record<string, boolean>>>(() => ({})),
});

export const triggerAllTouched = <T extends { _touched: Record<string, boolean> }>(model: T) => {
  const touched = model._touched;
  for (const k in touched) touched[k] = true;
};

export const validateProp = <
  TStore extends { _touched: Partial<Record<K, boolean>> },
  K extends keyof TStore,
>(
  store: TStore,
  field: K,
  validator: () => string,
): string => {
  if (!store._touched?.[field]) return "";
  return validator() || "";
};
