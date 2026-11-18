export type NativeWorkerProgress<Detail = never> = (
  message: string,
  percent?: number,
  detail?: Detail,
) => void;

/**
 * Answers each task sent to a native worker process with the handler's result, or its error message, under the task's ID.
 * Progress can carry a detail of the task's own, such as a finished part of its result.
 * Each worker process is its own bundle, so this imports nothing.
 * The worker exits once its parent disconnects.
 */
export const registerNativeWorker = <Input, Output, Detail = never>(
  handler: (input: Input, onProgress: NativeWorkerProgress<Detail>) => Promise<Output>,
) => {
  process.on("disconnect", () => process.exit(1));

  process.on("message", async ({ id, input }: { id: string; input: Input }) => {
    try {
      const data = await handler(input, (message, percent, detail) =>
        process.send({ id, progress: { detail, message, percent } }),
      );

      process.send({ data, id });
    } catch (error) {
      process.send({ error: error.message, id });
    }
  });
};
