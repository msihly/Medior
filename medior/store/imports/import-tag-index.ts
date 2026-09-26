import type { TagSchema } from "medior/_generated/server/models";
import type { RootStore } from "medior/store";
import { preferredTagLabel, TagRegExMatcher } from "medior/utils/common";
import { trpc } from "medior/utils/server";

const indexes = new WeakMap<RootStore, ImportTagIndex>();

export const getImportTagIndex = (stores: RootStore) => {
  if (!indexes.has(stores)) indexes.set(stores, new ImportTagIndex(stores));

  return indexes.get(stores);
};

class ImportTagIndex {
  private directory: Promise<{
    ancestorLabels: Map<string, { count: number; label: string }>;
    labels: Map<string, string>;
  }>;
  private matcher: Promise<TagRegExMatcher>;

  constructor(private stores: RootStore) {}

  add(tag: TagSchema) {
    this.directory
      ?.then(({ ancestorLabels, labels }) => {
        const key = tag.label.toLowerCase();
        const previous = ancestorLabels.get(labels.get(key));
        if (!previous || preferredTagLabel(previous.label, tag.label) === tag.label)
          labels.set(key, tag.id);

        ancestorLabels.set(tag.id, { count: tag.count, label: tag.label });
      })
      .catch(() => {});

    if (tag.regEx)
      this.matcher
        ?.then((matcher) => {
          matcher.add({ regEx: new RegExp(tag.regEx, "im"), tagId: tag.id });
        })
        .catch(() => {});
  }

  clear() {
    this.directory = null;
    this.matcher = null;
  }

  getDirectory() {
    if (!this.directory) {
      const pending = this.loadDirectory();
      this.directory = pending;
      pending.catch(() => {
        if (this.directory === pending) this.directory = null;
      });
    }

    return this.directory;
  }

  getMatcher(onProgress?: (status: string, completed: number, total: number) => void) {
    if (!this.matcher) {
      const pending = this.loadMatcher(onProgress);
      this.matcher = pending;
      pending.catch(() => {
        if (this.matcher === pending) this.matcher = null;
      });
    }

    return this.matcher;
  }

  private async loadDirectory() {
    const res = await trpc.listImportTags.mutate({});
    if (!res.success) throw new Error(res.error);

    const ancestorLabels = new Map<string, { count: number; label: string }>();
    const labels = new Map<string, string>();

    for (const tag of res.data) {
      const key = tag.label.toLowerCase();
      const previous = ancestorLabels.get(labels.get(key));
      if (!previous || preferredTagLabel(previous.label, tag.label) === tag.label)
        labels.set(key, tag.id);

      ancestorLabels.set(tag.id, { count: tag.count, label: tag.label });
    }

    return { ancestorLabels, labels };
  }

  private async loadMatcher(
    onProgress?: (status: string, completed: number, total: number) => void,
  ) {
    const res = await this.stores.tag.listRegExMaps();
    if (!res.success) throw new Error(res.error);

    const matcher = new TagRegExMatcher();
    for (let index = 0; index < res.data.length; index++) {
      matcher.add(res.data[index]);
      if (index % 128 === 0) {
        onProgress?.("Indexing tag regex rules", index, res.data.length);
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }

    onProgress?.("Indexing tag regex rules", res.data.length, res.data.length);

    return matcher;
  }

  update(tags: { tagId: string; updates: Partial<TagSchema> }[]) {
    if (tags.some(({ updates }) => "label" in updates)) this.directory = null;
    if (tags.some(({ updates }) => "regEx" in updates)) this.matcher = null;

    const counts = tags.filter(({ updates }) => "count" in updates);
    if (counts.length && this.directory)
      this.directory
        .then(({ ancestorLabels }) => {
          for (const { tagId, updates } of counts) {
            const tag = ancestorLabels.get(tagId);
            if (tag) tag.count = updates.count;
          }
        })
        .catch(() => {});
  }
}
