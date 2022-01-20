import { getParentOfType, Instance, types } from "mobx-state-tree";
import { RootStoreModel } from "store/root-store";
import { sortArray } from "utils";
import dayjs from "dayjs";

export const FileModel = types
  .model("File")
  .props({
    id: types.string,
    dateCreated: types.string,
    dateModified: types.string,
    ext: types.string,
    hash: types.string,
    isArchived: types.boolean,
    isSelected: types.boolean,
    originalName: types.maybeNull(types.string),
    originalPath: types.string,
    path: types.string,
    size: types.number,
    tags: types.array(types.string),
    thumbPath: types.string,
  })
  .views((self) => ({
    get tagCounts() {
      const rootStore = getParentOfType(self, RootStoreModel) as Instance<typeof RootStoreModel>;

      const counts = self.tags.map((t) => ({
        label: t,
        count: rootStore.fileStore.getTagCount(t),
      }));

      return sortArray(counts, "count", true, true);
    },
  }))
  .actions((self) => ({
    updateTags: (tags, dateModified = dayjs().toISOString()) => {
      self.tags = tags;
      self.dateModified = dateModified;
    },
  }));

type FileType = Instance<typeof FileModel>;
export interface File extends FileType {}
