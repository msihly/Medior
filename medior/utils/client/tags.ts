import type { File, FileCollection } from "medior/store";
import { makeTagSelector } from "medior/utils/common";
import { trpc } from "medior/utils/server";

const tagLoads = new WeakMap<File | FileCollection, symbol>();

/** Share one tag request across visible models and discard superseded responses. */
export const reloadItemTags = async (items: (File | FileCollection)[]) => {
  const request = Symbol();
  const snapshots = new Map([...new Set(items)].map((item) => [item, [...item.tagIds]]));
  const tagIds = [...new Set([...snapshots.values()].flat())];

  for (const item of snapshots.keys()) tagLoads.set(item, request);

  if (snapshots.size) {
    const res = tagIds.length ? await trpc.listTag.mutate({ filter: { id: tagIds } }) : null;

    if (res && !res.success) throw new Error(res.error);

    const selectTags = makeTagSelector(res?.data ?? []);

    for (const [item, ids] of snapshots) {
      if (
        tagLoads.get(item) === request &&
        item.tagIds.length === ids.length &&
        item.tagIds.every((id, index) => id === ids[index])
      ) {
        item.setTags(selectTags(ids));
        tagLoads.delete(item);
      }
    }
  }
};
