import { cast, getParentOfType, Instance, types } from "mobx-state-tree";
import { RootStoreModel } from "store/root-store";
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
    get activeTag() {
      return self.tags.find((t) => t.id === self.activeTagId);
    },
    getById: (id) => {
      return self.tags.find((t) => t.id === id);
    },
  }))
  .views((self) => ({
    get tagOptions() {
      const rootStore = getParentOfType(self, RootStoreModel) as Instance<typeof RootStoreModel>;

      const activeTagCounts = rootStore.fileStore.getTagCounts();

      const [activeTags, activeTagIds] = activeTagCounts.reduce(
        (acc, tag) => {
          acc[0].push({ ...tag, label: self.getById(tag.id)?.label });
          acc[1].push(tag.id);
          return acc;
        },
        [[], []]
      );

      const inactiveTags = self.tags
        .filter((t) => !activeTagIds.includes(t.id))
        .map((t) => ({ count: 0, id: t.id, label: t.label }));

      return [...activeTags, ...inactiveTags];
    },
  }))
  .actions((self) => ({
    createTag: (tag: Tag) => {
      self.tags.push(tag);
    },
    overwrite: (tags: Tag[]) => {
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
