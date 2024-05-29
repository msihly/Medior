import { _async, _await } from "mobx-keystone";
import { handleErrors } from "utils";

export const asyncAction = <ThisArg, Output, Input>(fn: (input: Input) => Promise<Output>) => {
  return _async(function* (this: ThisArg, input?: Input) {
    if (typeof fn !== "function") throw new Error("Provided function is not a function");

    const boundFn = fn.bind(this);
    if (typeof boundFn !== "function") throw new Error("Bound function is not a function");

    return yield* _await(handleErrors<Output>(() => boundFn(input)));
  });
};
