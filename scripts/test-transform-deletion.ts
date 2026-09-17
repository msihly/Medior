import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import vm from "node:vm";
import ts from "typescript";

const source = ts.createSourceFile("video-transformer.ts", readFileSync("medior/store/files/video-transformer.ts", "utf8"), ts.ScriptTarget.Latest, true);
let cleanup: ts.MethodDeclaration;
function visit(node: ts.Node) {
  if (ts.isMethodDeclaration(node) && node.name.getText(source) === "removeQueueFiles") cleanup = node;
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(cleanup);

const ids = Array.from({ length: 400_000 }, (_, index) => `transform-${index}`);
const search = {
  files: new Map([ ["deleted-file", {}], ["retained-file", {}] ]),
  ids: [...ids, "retained-transform"],
  results: [
    { fileId: "deleted-file", id: ids[0] },
    { fileId: "deleted-file", id: ids[399_999] },
    { fileId: "retained-file", id: "retained-transform" },
  ],
  selectedIds: [...ids, "retained-transform"],
  setFiles(value: Map<string, object>) { this.files = value; },
  setIds(value: string[]) { this.ids = value; },
  setResults(value: { fileId: string; id: string }[]) { this.results = value; },
  setSelectedIds(value: string[]) { this.selectedIds = value; },
};
const context = vm.createContext({ store: { search }, transformIds: ids });
vm.runInContext(ts.transpileModule(`function removeQueueFiles(${cleanup.parameters.map((parameter) => parameter.getText(source)).join(", ")}) ${cleanup.body.getText(source)}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
const startedAt = performance.now();
vm.runInContext("removeQueueFiles.call(store, [], transformIds)", context, { timeout: 5000 });
assert.deepEqual(search.selectedIds, ["retained-transform"]);
assert.deepEqual(search.ids, ["retained-transform"]);
assert.equal(search.results.length, 1);
assert.equal(search.files.has("deleted-file"), false);
assert.equal(search.files.has("retained-file"), true);
console.log(`400,000-ID client cleanup passed in ${Math.round(performance.now() - startedAt)} ms (synthetic arrays; no database).`);

search.results = [{ fileId: "shared-file", id: "deleted" }, { fileId: "shared-file", id: "retained" }];
search.files = new Map([["shared-file", {}]]);
search.ids = ["deleted", "retained"];
search.selectedIds = ["deleted", "retained"];
context.transformIds = ["deleted"];
vm.runInContext("removeQueueFiles.call(store, [], transformIds)", context);
assert.equal(search.results[0].id, "retained");
assert.equal(search.files.has("shared-file"), true);
vm.runInContext('removeQueueFiles.call(store, ["shared-file"])', context);
assert.equal(search.results.length, 0);
assert.equal(search.files.size, 0);
console.log("Partial selection and shared-file cleanup checks passed.");
