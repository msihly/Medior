import { _async, _await, getSnapshot, isTreeNode } from "mobx-keystone";
import { handleErrors } from "medior/utils/common";

export const asyncAction = <ThisArg, Output, Input = never>(
  fn: (input: Input) => Promise<Output>,
) => {
  return _async(function* (this: ThisArg, input?: Input) {
    if (typeof fn !== "function") throw new Error("Provided function is not a function");

    const boundFn = fn.bind(this);
    if (typeof boundFn !== "function") throw new Error("Bound function is not a function");

    return yield* _await(handleErrors<Output>(() => boundFn(input)));
  });
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
