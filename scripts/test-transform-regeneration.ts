import assert from "node:assert/strict";
import { deferRegeneration, withRegenerationBatch } from "../medior/server/database/regeneration-batch";
import { mergeDuplicateMetadata, replaceDuplicateCollectionReferences } from "../medior/utils/common/duplicate-metadata";

async function main() {
  const calls: string[][] = [];
  const regenerate = async (ids: string[]) => {
    assert.equal(deferRegeneration(regenerate, ids), false);
    calls.push(ids);
  };

  assert.equal(deferRegeneration(regenerate, ["outside"]), false);
  await withRegenerationBatch(async () => {
    deferRegeneration(regenerate, ["a", "b"]);
    await withRegenerationBatch(async () => {
      deferRegeneration(regenerate, ["b", "c"]);
    });
    assert.deepEqual(calls, []);
  });
  assert.deepEqual(calls, [["a", "b", "c"]]);

  calls.length = 0;
  await Promise.all([
    withRegenerationBatch(async () => {
      deferRegeneration(regenerate, ["first"]);
      await Promise.resolve();
    }),
    withRegenerationBatch(async () => {
      deferRegeneration(regenerate, ["second"]);
    }),
  ]);
  assert.deepEqual(calls.sort(), [["first"], ["second"]]);

  calls.length = 0;
  await assert.rejects(withRegenerationBatch(async () => {
    deferRegeneration(regenerate, ["partial"]);
    throw new Error("Interrupted");
  }), /Interrupted/);
  assert.deepEqual(calls, [["partial"]]);

  calls.length = 0;
  await assert.rejects(withRegenerationBatch(async () => {
    deferRegeneration(regenerate, ["still flushed"], "tags");
    deferRegeneration(async (ids) => { calls.push(ids); }, ["merge"], "complete");
    deferRegeneration(async () => { throw new Error("Queue failed"); }, ["failed"]);
  }), /Failed to flush regeneration batch/);
  assert.deepEqual(calls, [["still flushed"]]);

  calls.length = 0;
  await withRegenerationBatch(async () => {
    deferRegeneration(async (ids) => { calls.push(ids); }, ["tags"], "tags");
    deferRegeneration(regenerate, ["files"]);
  });
  assert.deepEqual(calls, [["files"], ["tags"]]);

  calls.length = 0;
  await withRegenerationBatch(async () => {
    deferRegeneration(async (ids) => { calls.push(ids); }, ["merged"], "complete");
    deferRegeneration(regenerate, ["files"]);
  });
  assert.deepEqual(calls, [["files"], ["merged"]]);

  const original = {
    diffusionParams: "source",
    originalName: "original",
    rating: 5,
    tagIds: ["b", "a"],
    timestamps: [{ id: "timestamp", label: "Source", pairs: [{ endDuration: "2", id: "pair", order: 0, startDuration: "1" }] }],
    transcription: { segments: [], text: "source" },
  };
  const match = { ...original, originalName: "matched", rating: 3, tagIds: ["a", "c"] };
  const merged = mergeDuplicateMetadata(original, match);
  assert.deepEqual(mergeDuplicateMetadata(original, merged), merged);
  assert.equal(merged.originalName, "matched");
  assert.equal(merged.rating, 5);
  assert.deepEqual(merged.tagIds, ["a", "b", "c"]);

  const entries = replaceDuplicateCollectionReferences([
    { fileId: "original", index: 0 },
    { fileId: "other", index: 1 },
    { fileId: "matched", index: 2 },
  ], "original", "matched");
  assert.deepEqual(entries, [{ fileId: "matched", index: 0 }, { fileId: "other", index: 1 }]);
  assert.deepEqual(replaceDuplicateCollectionReferences(entries, "original", "matched"), entries);
  console.log("Transform regeneration and duplicate metadata checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
