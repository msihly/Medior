import { cast, getParentOfType, Instance, SnapshotOrInstance, types } from "mobx-state-tree";
import { RootStoreModel } from "store/root-store";
import { FileStore, TagOption } from "store/files";
import { Tag, TagModel } from ".";

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
    getById: (id): Tag => {
      return self.tags.find((t) => t.id === id);
    },
  }))
  .views((self) => ({
    get tagOptions(): TagOption[] {
      const rootStore = getParentOfType(self, RootStoreModel);
      const fileStore: FileStore = rootStore.fileStore;

      const activeTagCounts = fileStore.getTagCounts();

      const [activeTags, activeTagIds] = activeTagCounts.reduce(
        (acc, cur) => {
          const tag = self.getById(cur.id);
          acc[0].push({
            ...cur,
            label: tag?.label,
            parentLabels: cast(tag.parentTags.map((t) => t.label)),
          });

          acc[1].push(cur.id);
          return acc;
        },
        [[] as TagOption[], [] as String[]]
      );

      const inactiveTags: TagOption[] = self.tags.reduce((acc, cur) => {
        if (activeTagIds.includes(cur.id)) return acc;
        else
          acc.push({
            count: 0,
            id: cur.id,
            label: cur.label,
            parentLabels: cur.parentTags.map((t) => t.label),
          });
        return acc;
      }, []);

      return [...activeTags, ...inactiveTags];
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
