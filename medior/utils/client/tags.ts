import type { File, FileCollection } from "medior/store";
import { makeTagSelector } from "medior/utils/common";
import { trpc } from "medior/utils/server";

const tagLoads = new WeakMap<File | FileCollection, symbol>();

/** Load files with their referenced tags attached; throws when either request fails. */
export const loadFilesWithTags = async (fileIds: string[]) => {
  const res = await trpc.listFile.mutate({ args: { filter: { id: fileIds } } });

  if (!res.success) throw new Error(res.error);

  const tagIds = [...new Set(res.data.items.flatMap((file) => file.tagIds))];
  const tagRes = await trpc.listTag.mutate({ filter: { id: tagIds } });

  if (!tagRes.success) throw new Error(tagRes.error);

  const selectTags = makeTagSelector(tagRes.data);

  return res.data.items.map((file) => ({ ...file, tags: selectTags(file.tagIds) }));
};

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
