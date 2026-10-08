import { createHash } from "crypto";
import {
  BackgroundOperationModel,
  BackgroundOperationSchema,
} from "medior/_generated/server/models";
import { Types } from "mongoose";
import {
  backgroundExecution,
  checkBackgroundExecution,
  runBackgroundExecution,
} from "medior/server/database/background-execution";
import { dayjs } from "medior/utils/common";
import { metadataWork } from "./metadata-context";
import { withMetadataMutation } from "./metadata-mutations";
import { MetadataPayload, readMetadataPayload, writeMetadataPayload } from "./metadata-payloads";

export interface MetadataWork {
  input?: unknown;
  inputPayload?: MetadataPayload;
  name: string;
  result?: unknown;
  resultPayload?: MetadataPayload;
  snapshotPayloads?: Record<string, MetadataPayload>;
  snapshots?: Record<string, { value: unknown }>;
}

const activeWork = new Map<string, Promise<unknown>>();
const handlers = new Map<string, (input: any) => Promise<unknown>>();

export const metadataWriteOptions = () => ({ j: true, w: "majority" as const });

export const readSavedMetadataSnapshot = async <T>(
  key: string,
): Promise<{ value: T } | undefined> => {
  const payload =
    metadataWork.getStore()?.snapshotPayloads[createHash("sha256").update(key).digest("hex")];

  if (payload) return { value: await readMetadataPayload<T>(payload) };
};

/** Keep the original input to destructive steps available after partial success. */
export const readMetadataSnapshot = async <T>(
  key: string,
  read: () => PromiseLike<T>,
): Promise<T> => {
  const work = metadataWork.getStore();

  if (!work) return read();

  const snapshotKey = createHash("sha256").update(key).digest("hex");
  const saved = await readSavedMetadataSnapshot<T>(key);

  if (saved) return saved.value;

  const value = await read();
  const payload = await writeMetadataPayload(work.id, snapshotKey, value);

  await BackgroundOperationModel.updateOne(
    { _id: work.id },
    { $set: { [`work.snapshotPayloads.${snapshotKey}`]: payload } },
    metadataWriteOptions(),
  );

  work.snapshotPayloads[snapshotKey] = payload;

  return value;
};

/** Retrying creation must reuse the ID selected for the saved request. */
export const getMetadataCreateId = (key: string) => {
  const work = metadataWork.getStore();

  return work
    ? new Types.ObjectId(
        createHash("sha256").update(`${work.id}:${key}`).digest("hex").slice(0, 24),
      )
    : new Types.ObjectId();
};

export const runMetadataWork = async (operation: BackgroundOperationSchema) => {
  if (activeWork.has(operation.id)) return activeWork.get(operation.id);

  const pending = Promise.resolve().then(async () => {
    const execution = backgroundExecution.getStore();
    const previousLabel = execution?.label;
    const previousOperationId = execution?.operationId;

    try {
      checkBackgroundExecution();

      if (execution) {
        execution.operationId = operation.id;

        if (operation.work?.name === "completeImportBatch")
          execution.label = "import metadata finalization";
      }

      const handler = handlers.get(operation.work?.name);

      if (!handler) throw new Error(`Metadata handler unavailable: ${operation.work?.name}`);

      const claimed = await BackgroundOperationModel.updateOne(
        { _id: operation.id, status: { $in: ["PENDING", "RUNNING"] } },
        { $set: { error: null, startedAt: dayjs().toISOString(), status: "RUNNING" } },
        metadataWriteOptions(),
      );

      if (!claimed.matchedCount) {
        const current = await BackgroundOperationModel.findById(operation.id)
          .select({ "work.result": 1, "work.resultPayload": 1 })
          .lean();

        return current?.work?.resultPayload
          ? readMetadataPayload(current.work.resultPayload)
          : current?.work?.result;
      }

      // Migrate saved requests before executing them; already queued work remains recoverable.
      if (!operation.work.inputPayload) {
        operation.work.inputPayload = await writeMetadataPayload(
          operation.id,
          "input",
          operation.work.input,
        );

        operation.work.snapshotPayloads = {};

        for (const [key, snapshot] of Object.entries(operation.work.snapshots ?? {}))
          operation.work.snapshotPayloads[key] = await writeMetadataPayload(
            operation.id,
            key,
            snapshot.value,
          );

        await BackgroundOperationModel.updateOne(
          { _id: operation.id },
          {
            $set: {
              "work.inputPayload": operation.work.inputPayload,
              "work.snapshotPayloads": operation.work.snapshotPayloads,
            },
            $unset: { "work.input": 1, "work.snapshots": 1 },
          },
          metadataWriteOptions(),
        );
      }

      const input = await readMetadataPayload(operation.work.inputPayload);
      const result = await metadataWork.run(
        {
          id: operation.id,
          name: operation.work.name,
          snapshotPayloads: operation.work.snapshotPayloads ?? {},
        },
        () => withMetadataMutation(() => handler(input)),
      );
      const resultPayload = await writeMetadataPayload(operation.id, "result", result);

      await BackgroundOperationModel.updateOne(
        { _id: operation.id },
        {
          $set: {
            completedAt: dayjs().toISOString(),
            dateModified: dayjs().toISOString(),
            message: "Metadata changes completed.",
            processedCount: 1,
            status: "COMPLETE",
            "work.resultPayload": resultPayload,
          },
        },
        metadataWriteOptions(),
      );

      return result;
    } catch (error) {
      // Cancellation leaves the saved request runnable on the next startup.
      checkBackgroundExecution();
      await BackgroundOperationModel.updateOne(
        { _id: operation.id },
        {
          $set: {
            dateModified: dayjs().toISOString(),
            error: error?.message ?? String(error),
            message: "Completed changes were retained. Retry continues this saved request.",
            status: "ERROR",
          },
        },
        metadataWriteOptions(),
      );

      throw error;
    } finally {
      if (execution) {
        execution.label = previousLabel;
        execution.operationId = previousOperationId;
      }

      activeWork.delete(operation.id);
      backgroundExecution.exit(async () => {
        try {
          const { emitBackgroundOperation } = await import(
            "medior/server/database/actions/background-operations"
          );

          await emitBackgroundOperation(operation.id);
        } catch (error) {
          console.error("Metadata activity update failed:", error);
        }
      });
    }
  });

  activeWork.set(operation.id, pending);

  return pending;
};

/** Persist foreground metadata requests before applying any of their linked writes. */
export const registerMetadataWork = <Input, Output>(
  name: string,
  run: (input: Input) => Promise<Output>,
  persistInBackground = false,
) => {
  if (handlers.has(name)) throw new Error(`Duplicate metadata handler: ${name}`);

  handlers.set(name, run);

  return async (input: Input): Promise<Output> => {
    // Linked calls belong to the same saved request and propagate failures to its owner.
    if (metadataWork.getStore() || (backgroundExecution.getStore() && !persistInBackground))
      return withMetadataMutation(() => run(input));
    else {
      const id = new Types.ObjectId();
      const inputPayload = await writeMetadataPayload(String(id), "input", input);

      const operation = await new BackgroundOperationModel({
        _id: id,
        dateCreated: dayjs().toISOString(),
        dateModified: dayjs().toISOString(),
        label: name
          .replace(/^generated:_?/, "")
          .replace(/([a-z])([A-Z])/g, "$1 $2")
          .replace(/^./, (letter) => letter.toUpperCase()),
        processedCount: 0,
        status: "PENDING",
        targetIds: [],
        totalCount: 1,
        type: "metadataAction",
        work: { inputPayload, name, snapshotPayloads: {} },
      }).save(metadataWriteOptions());

      return (await runBackgroundExecution(() =>
        runMetadataWork({ ...operation.toObject(), id: String(operation._id) }),
      )) as Output;
    }
  };
};

export const resumeMetadataWork = async (canContinue: () => boolean) => {
  const { isImporterPaused } = await import("medior/server/database/actions/file-imports");

  while (canContinue()) {
    const operation = await BackgroundOperationModel.findOne({
      _id: { $nin: [...activeWork.keys()] },
      ...(isImporterPaused() ? { "work.name": { $ne: "completeImportBatch" } } : {}),
      status: { $in: ["PENDING", "RUNNING"] },
      type: "metadataAction",
    })
      .sort({ dateCreated: 1, _id: 1 })
      .lean();

    if (!operation) return;

    try {
      await runMetadataWork({ ...operation, id: String(operation._id) });
    } catch (error) {
      checkBackgroundExecution();
      console.error("Metadata request retained for retry:", error);
    }
  }
};

export const repairMetadata = async <T, R>(
  candidates: AsyncIterable<T>,
  repair: (candidate: T) => Promise<R>,
  onProcessed?: (repaired: { candidate: T; result: R }) => Promise<void>,
) => {
  for await (const candidate of candidates) {
    checkBackgroundExecution();

    const result = await withMetadataMutation(() => repair(candidate));

    await onProcessed?.({ candidate, result });
  }
};
