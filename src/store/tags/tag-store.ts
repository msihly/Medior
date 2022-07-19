import { cast, getParentOfType, Instance, SnapshotOrInstance, types } from "mobx-state-tree";
import { RootStoreModel } from "store/root-store";
import { File, FileStore, TagOptionSnapshot } from "store/files";
import { Tag, TagModel } from ".";

// const getTagAncestry = (tags: Tag[], parentIds: string[]): string[] => {
//   return parentIds.flatMap((id) => {
//     const tag = tags.find((t) => t.id === id);
//     return [...parentIds, ...getTagAncestry(tags, tag.parentIds)];
//   });
// };

const TagCountModel = types.model({
  id: types.string,
  count: types.number,
});
export type TagCount = Instance<typeof TagCountModel>;

export const defaultTagStore = {
  activeTagId: null,
  isTagManagerOpen: false,
  tags: [],
  tagManagerMode: "search",
};

export const TagStoreModel = types
  .model("TagStore")
  .props({
    activeTagId: types.maybeNull(types.string),
    isTagManagerOpen: types.boolean,
    tags: types.array(TagModel),
    tagManagerMode: types.enumeration(["create", "edit", "search"]),
  })
  .views((self) => ({
    get activeTag(): Tag {
      return self.tags.find((t) => t.id === self.activeTagId);
    },
    get tagCounts(): TagCount[] {
      const rootStore = getParentOfType(self, RootStoreModel);
      const fileStore: FileStore = rootStore.fileStore;

      return fileStore.files
        .map((f) => f.tags.map((t) => [t.id, ...t.parentIds]))
        .flat(2)
        .reduce((tagCounts, id) => {
          if (!id) return tagCounts;

          const tagCount = tagCounts.find((t) => t.id === id);
          if (!tagCount) tagCounts.push({ count: 1, id });
          else tagCount.count++;

          return tagCounts;
        }, [] as TagCount[])
        .sort((a, b) => a.count - b.count);
    },
    getById: (id: string): Tag => {
      return self.tags.find((t) => t.id === id);
    },
  }))
  .views((self) => ({
    getTagCounts: (files: File[]): TagCount[] => {
      return files.reduce((tagCounts, file) => {
        file.tags
          .flatMap((t) => [t.id, ...t.parentIds])
          .forEach((id) => {
            const tagCount = tagCounts.find((t) => t.id === id);
            tagCounts.push({ id, count: tagCount?.count ?? 0 });
          });

        return tagCounts;
      }, [] as TagCount[]);
    },
    getTagCountById: (id: string): number => {
      return self.tagCounts.find((t) => t.id === id)?.count ?? 0;
    },
  }))
  .views((self) => ({
    get tagOptions(): TagOptionSnapshot[] {
      return self.tags
        .map((t) => ({
          count: t.count,
          id: t.id,
          label: t.label,
          parentLabels: t.parentTags.map((t) => t.label),
        }))
        .sort((a, b) => b.count - a.count);
    },
  }))
  .actions((self) => ({
    createTag: (tag: Tag) => {
      self.tags.push(tag);
    },
    overwrite: (tags: SnapshotOrInstance<typeof self.tags>) => {
      self.tags = cast(tags);
    },
    setActiveTagId: (tagId: string) => {
      self.activeTagId = tagId;
    },
    setIsTagManagerOpen: (isOpen: boolean) => {
      self.isTagManagerOpen = isOpen;
    },
    setTagManagerMode: (mode: "create" | "edit" | "search") => {
      self.tagManagerMode = mode;
    },
  }));

export interface TagStore extends Instance<typeof TagStoreModel> {}
