import { cast, getParentOfType, Instance, SnapshotOrInstance, types } from "mobx-state-tree";
import { RootStoreModel } from "store/root-store";
import { File, FileStore, TagOptionSnapshot } from "store/files";
import { Tag, TagModel } from ".";

export const getTagAncestry = (tags: Tag[]): string[] =>
  tags.flatMap((t) => [t.id, ...getTagAncestry(t.parentTags)]);

const TagCountModel = types.model({
  id: types.string,
  count: types.number,
});
export type TagCount = Instance<typeof TagCountModel>;

export const defaultTagStore = {
  activeTagId: null,
  isTaggerOpen: false,
  isTagManagerOpen: false,
  tags: [],
  taggerMode: "edit",
  tagManagerMode: "search",
};

export const TagStoreModel = types
  .model("TagStore")
  .props({
    activeTagId: types.maybeNull(types.string),
    isTaggerOpen: types.boolean,
    isTagManagerOpen: types.boolean,
    tags: types.array(TagModel),
    taggerMode: types.enumeration(["create", "edit"]),
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
        .map((f) => getTagAncestry(f.tags))
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
    getByLabel: (label: string): Tag => {
      return self.tags.find((t) => t.label === label);
    },
  }))
  .views((self) => ({
    getTagCounts: (files: File[], includeParents = false): TagCount[] => {
      const tagIds = [
        ...new Set(
          files
            .map((f) => f.tags.map((t) => [t.id, ...(includeParents ? t.parentIds : [])]))
            .flat(2)
        ),
      ];

      return tagIds.map((id) => ({
        id,
        count: self.tagCounts.find((t) => t.id === id)?.count ?? 0,
      }));
    },
    getTagCountById: (id: string): number => {
      return self.tagCounts.find((t) => t.id === id)?.count ?? 0;
    },
  }))
  .views((self) => ({
    get tagOptions(): TagOptionSnapshot[] {
      return self.tags
        .map((t) => ({
          aliases: [...t.aliases],
          count: t.count,
          id: t.id,
          label: t.label,
          parentLabels: t.parentTags.map((t) => t.label),
        }))
        .sort((a, b) => b.count - a.count);
    },
  }))
  .actions((self) => ({
    createTag: (tag: SnapshotOrInstance<Tag>) => {
      self.tags.push(tag);
    },
    deleteTag: (id: string) => {
      self.tags = cast(self.tags.filter((t) => t.id !== id));
    },
    overwrite: (tags: SnapshotOrInstance<Tag>[]) => {
      self.tags = cast(tags);
    },
    setActiveTagId: (tagId: string) => {
      self.activeTagId = tagId;
    },
    setIsTaggerOpen: (isOpen: boolean) => {
      if (isOpen) self.taggerMode = "edit";
      self.isTaggerOpen = isOpen;
    },
    setIsTagManagerOpen: (isOpen: boolean) => {
      self.isTagManagerOpen = isOpen;
    },
    setTaggerMode: (mode: "create" | "edit") => {
      self.taggerMode = mode;
    },
    setTagManagerMode: (mode: "create" | "edit" | "search") => {
      self.tagManagerMode = mode;
    },
  }));

export interface TagStore extends Instance<typeof TagStoreModel> {}
