import { LeanDocument, Types } from "mongoose";
import { handleErrors } from "medior/utils";

export const leanModelToJson = <T>(
  doc: LeanDocument<T & { _id: Types.ObjectId; __v?: number }>
) => {
  try {
    if (!doc) return null;
    const { _id, __v, ...rest } = doc;
    return { ...rest, id: _id.toString() } as unknown as T;
  } catch (err) {
    console.error(err.stack);
    return null;
  }
};

export const makeAction =
  <Input, Output>(fn: (input: Input) => Promise<Output>) =>
  (args: Input) =>
    handleErrors(async () => await fn(args));

export const objectId = (id: string) => new Types.ObjectId(id);

export const objectIds = (ids: string[]) => ids.map(objectId);
