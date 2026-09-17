import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = ts.createSourceFile(
  "sockets.ts",
  readFileSync("medior/views/common/sockets.ts", "utf8"),
  ts.ScriptTarget.Latest,
  true,
);
const callbacks = new Map<string, string>();

function findCallbacks(node: ts.Node) {
  if (ts.isCallExpression(node) && node.expression.getText(source) === "makeSocket") {
    if (ts.isStringLiteral(node.arguments[0])) {
      callbacks.set(node.arguments[0].text, node.arguments[1].getText(source));
    }
  }
  ts.forEachChild(node, findCallbacks);
}
findCallbacks(source);

const row = {
  id: "first",
  status: "RUNNING",
  update(updates: object) { Object.assign(this, updates); },
};
const active = {
  id: "first",
  progressPercent: 0,
  status: "RUNNING",
  update(updates: object) { Object.assign(this, updates); },
};
const received: unknown[] = [];
const store = {
  activeTransform: active,
  isOpen: true,
  loadActiveTransform: () => assert.fail("A live snapshot must not fetch the active file"),
  loadQueueCount: () => assert.fail("Per-file updates must not reload totals"),
  receiveActiveTransform: (snapshot: unknown) => received.push(snapshot),
  removeQueueFiles: () => assert.fail("Per-file updates must not replace the search results"),
  search: {
    _deleteResults: () => assert.fail("Per-file updates must not trigger the result-loading reaction"),
    getResult: (id: string) => id === row.id ? row : undefined,
  },
  setFocusedTransformId: () => {},
};

function handler(event: string) {
  assert.ok(callbacks.has(event));
  return vm.runInNewContext(
    ts.transpileModule(`(${callbacks.get(event)})`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText,
    { stores: { file: { videoTransformer: store } } },
  );
}

const loaded = handler("onFileTransformLoaded");
loaded({ file: { id: "first-file" }, transform: { id: "first" } });
loaded({ file: { id: "second-file" }, transform: { id: "second" } });
assert.equal(received.length, 2, "Consecutive file transitions must not be throttled");

const updated = handler("onFileTransformUpdated");
updated({ id: "first", updates: { progressPercent: 42 } });
assert.equal(active.progressPercent, 42);
for (const status of ["DUPLICATE", "MERGED", "REPLACED"]) {
  updated({ id: "first", updates: { status } });
  assert.equal(active.status, status);
  assert.equal(row.status, status);
}
store.isOpen = false;
loaded({ file: { id: "third-file" }, transform: { id: "third" } });
assert.equal(received.length, 2);
console.log("Live transform updates and search reload regression checks passed.");
