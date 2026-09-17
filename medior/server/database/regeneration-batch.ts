import { AsyncLocalStorage } from "async_hooks";

type RegenerationPhase = "files" | "tags" | "collections" | "complete";

type Regeneration = (ids: string[]) => Promise<unknown>;

const regenerationBatch = new AsyncLocalStorage<
  Map<Regeneration, { ids: Set<string>; phase: RegenerationPhase }>
>();

export const deferRegeneration = (
  regenerate: Regeneration,
  ids: string[],
  phase: RegenerationPhase = "files",
) => {
  const batch = regenerationBatch.getStore();
  if (!batch) return false;
  if (!batch.has(regenerate)) batch.set(regenerate, { ids: new Set(), phase });
  for (const id of ids) batch.get(regenerate).ids.add(id);
  return true;
};

export const withRegenerationBatch = async <T>(run: () => Promise<T>) => {
  if (regenerationBatch.getStore()) return run();
  const batch = new Map<Regeneration, { ids: Set<string>; phase: RegenerationPhase }>();
  try {
    return await regenerationBatch.run(batch, run);
  } finally {
    const errors: unknown[] = [];
    const phases: RegenerationPhase[] = ["files", "tags", "collections", "complete"];
    for (const [regenerate, { ids, phase }] of [...batch].sort(
      (a, b) => phases.indexOf(a[1].phase) - phases.indexOf(b[1].phase),
    )) {
      if (phase === "complete" && errors.length) continue;
      try {
        await regenerate([...ids]);
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length)
      throw new AggregateError(
        errors,
        `Failed to flush regeneration batch: ${errors.map((error) => (error instanceof Error ? error.message : String(error))).join("; ")}`,
      );
  }
};
