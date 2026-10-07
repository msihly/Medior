import { AsyncLocalStorage } from "async_hooks";
import type { MetadataPayload } from "./metadata-payloads";

export const metadataWork = new AsyncLocalStorage<{
  id: string;
  name: string;
  snapshotPayloads: Record<string, MetadataPayload>;
}>();
