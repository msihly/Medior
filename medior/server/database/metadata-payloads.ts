import { EJSON } from "bson";
import { createHash } from "crypto";
import { Schema } from "mongoose";
import { isPlainObject } from "medior/utils/common";
import { checkBackgroundExecution } from "./background-execution";
import { backgroundExecutionPlugin } from "./database-context";
import { metadataWriteOptions } from "./metadata-work";
import { registerPersistenceModel } from "./persistence";

export interface MetadataPayload {
  bytes: number;
  key: string;
  parts: number;
}

const PAYLOAD_CHUNK_BYTES = 4 * 1024 * 1024;
const schema = new Schema<{ _id: string; data: Buffer; ownerId: string }>({
  _id: { required: true, type: String },
  data: { required: true, type: Buffer },
  ownerId: { required: true, type: String },
});

schema.plugin(backgroundExecutionPlugin);
schema.index({ ownerId: 1 });

const MetadataPayloadModel = registerPersistenceModel("MetadataPayload", schema);

/** EJSON saves missing values as null, so they're left out to stay missing when read back. */
const omitUndefined = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(omitUndefined);
  else if (isPlainObject(value))
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, omitUndefined(entry)]),
    );
  else return value;
};

export const readMetadataPayload = async <T>(payload: MetadataPayload): Promise<T> => {
  const data = Buffer.allocUnsafe(payload.bytes);
  let offset = 0;

  for (let part = 0; part < payload.parts; part++) {
    checkBackgroundExecution();

    const chunk = await MetadataPayloadModel.findById(`${payload.key}:${part}`);

    if (!chunk || offset + chunk.data.length > data.length)
      throw new Error("Saved metadata payload is incomplete.");

    offset += chunk.data.copy(data, offset);
  }

  if (offset !== data.length) throw new Error("Saved metadata payload is incomplete.");

  return (EJSON.parse(data.toString("utf8")) as { value: T }).value;
};

export const writeMetadataPayload = async (
  operationId: string,
  key: string,
  value: unknown,
): Promise<MetadataPayload> => {
  const data = Buffer.from(EJSON.stringify(omitUndefined({ value })), "utf8");
  const payload = {
    bytes: data.byteLength,
    key: `${operationId}:${key}:${createHash("sha256").update(data).digest("hex")}`,
    parts: Math.ceil(data.byteLength / PAYLOAD_CHUNK_BYTES),
  };

  for (let part = 0; part < payload.parts; part++) {
    checkBackgroundExecution();

    await MetadataPayloadModel.updateOne(
      { _id: `${payload.key}:${part}` },
      {
        $setOnInsert: {
          data: Buffer.from(
            data.subarray(part * PAYLOAD_CHUNK_BYTES, (part + 1) * PAYLOAD_CHUNK_BYTES),
          ),
          ownerId: operationId,
        },
      },
      { ...metadataWriteOptions(), upsert: true },
    );
  }

  return payload;
};
