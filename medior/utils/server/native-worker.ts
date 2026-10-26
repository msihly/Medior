export type NativeWorkerProgress = (message: string, percent?: number) => void;

/**
 * Answers each task sent to a native worker process with the handler's result, or its error
 * message, under the task's ID. Each worker process is its own bundle, so this imports nothing.
 * The worker exits once its parent disconnects.
 */
export const registerNativeWorker = <Input, Output>(
  handler: (input: Input, onProgress: NativeWorkerProgress) => Promise<Output>,
) => {
  process.on("disconnect", () => process.exit(1));

  process.on("message", async ({ id, input }: { id: string; input: Input }) => {
    try {
      const data = await handler(input, (message, percent) =>
        process.send({ id, progress: { message, percent } }),
      );

      process.send({ data, id });
    } catch (error) {
      process.send({ error: error.message, id });
    }
  });
};
