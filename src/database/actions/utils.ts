import { LeanDocument, Types } from "mongoose";

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

export const objectIds = (ids: string[]) => ids.map((id) => new Types.ObjectId(id));