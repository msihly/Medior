import { EJSON } from "bson";
import { createHash } from "crypto";
import { Schema } from "mongoose";
import { checkBackgroundExecution } from "./background-execution";
import { backgroundExecutionPlugin } from "./database-context";
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
  const data = Buffer.from(EJSON.stringify({ value }), "utf8");
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
      { j: true, upsert: true, w: "majority" },
    );
  }

  return payload;
};
