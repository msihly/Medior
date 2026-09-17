import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

async function main() {
  const source = ts.createSourceFile("duplicate-batch.tsx", readFileSync("medior/components/files/video-transformer-modal/duplicate-batch.tsx", "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const callbacks = new Map<string, string>();
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && ["merge", "stop"].includes(node.name.getText(source)))
      callbacks.set(node.name.getText(source), node.initializer.getText(source));
    ts.forEachChild(node, visit);
  }
  visit(source);
  let progress = "";
  let isRunning = false;
  let cancelRequests = 0;
  let mergeRequests = 0;
  let resolveMerge: (result: unknown) => void;
  const listeners = new Map<string, (args: unknown) => void>();
  const context = vm.createContext({
    CONSTANTS: { FILE: { TRANSFORM: { BATCH_SIZE: 2 } } },
    cancelled: { current: false },
    chunkArray: (ids: string[]) => [ids.slice(0, 2), ids.slice(2)],
    setFailures: () => {},
    setIsRunning: (value: boolean) => { isRunning = value; },
    setProgress: (value: string | ((previous: string) => string)) => { progress = typeof value === "function" ? value(progress) : value; },
    socket: {
      off: (event: string) => listeners.delete(event),
      on: (event: string, handler: (args: unknown) => void) => listeners.set(event, handler),
    },
    store: { loadActiveTransform: async () => {}, loadQueue: async () => {}, loadQueueCount: async () => {} },
    toast: { error: (message: string) => assert.fail(message) },
    trpc: {
      cancelFileTransformDuplicateMerge: { mutate: async () => { cancelRequests++; return { success: true }; } },
      listFileTransformDuplicates: { mutate: async () => ({ data: ["first", "second", "third"], success: true }) },
      mergeFileTransformDuplicate: { mutate: () => { mergeRequests++; return new Promise((resolve) => { resolveMerge = resolve; }); } },
    },
  });
  function handler(name: string) {
    return vm.runInContext(ts.transpileModule(`(${callbacks.get(name)})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  }
  const running = handler("merge")();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(isRunning, true);
  assert.match(progress, /Found 3 duplicates/);
  assert.equal(mergeRequests, 1);
  listeners.get("onDuplicateMergeProgress")({ batchId: "first", completed: 1, failed: 0, isRegenerating: false });
  assert.match(progress, /1 \/ 3 checked; 1 merged/);
  listeners.get("onDuplicateMergeProgress")({ batchId: "other", completed: 100, failed: 0, isRegenerating: false });
  assert.match(progress, /1 \/ 3 checked; 1 merged/);
  listeners.get("onDuplicateMergeProgress")({ batchId: "first", completed: 1, failed: 0, isRegenerating: true });
  assert.match(progress, /Updating batch metadata/);
  await handler("stop")();
  assert.equal(cancelRequests, 1);
  resolveMerge({ data: { completed: 1, failures: [] }, success: true });
  await running;
  assert.equal(mergeRequests, 1, "Cancellation must prevent the next batch");
  assert.equal(listeners.size, 0);
  assert.equal(isRunning, false);
  assert.match(progress, /^Stopped/);
  console.log("Duplicate lookup, merge progress, and cancellation checks passed.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
