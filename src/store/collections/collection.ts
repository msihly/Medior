import { applySnapshot, getParentOfType, Instance, types } from "mobx-state-tree";
import { RootStoreModel } from "store/root-store";
import { FileStore } from "store/files";
import { TagStore } from "store/tags";

const FileIdIndexModel = types.model({
  fileId: types.string,
  index: 0,
});
export type FileIdIndex = Instance<typeof FileIdIndexModel>;

export const FileCollectionModel = types
  .model("FileCollection")
  .props({
    fileIdIndexes: types.array(FileIdIndexModel),
    id: types.string,
    title: types.string,
  })
  .views((self) => ({
    get fileIndexes() {
      const rootStore = getParentOfType(self, RootStoreModel);
      const fileStore: FileStore = rootStore.fileStore;
      return self.fileIdIndexes.map(({ fileId, index }) => ({
        file: fileStore.getById(fileId),
        index,
      }));
    },
  }))
  .views((self) => ({
    get rating() {
      const ratingTotals = self.fileIndexes.reduce(
        (acc, cur) => {
          if (cur.file.rating > 0) {
            acc.numerator += cur.file.rating;
            acc.denominator++;
          }
          return acc;
        },
        { numerator: 0, denominator: 0 }
      );

      return ratingTotals.denominator > 0 ? ratingTotals.numerator / ratingTotals.denominator : 0;
    },
    get tags() {
      const rootStore = getParentOfType(self, RootStoreModel);
      const tagStore: TagStore = rootStore.tagStore;
      return [...new Set(self.fileIndexes.flatMap((f) => f.file.tagIds))].map((tagId) =>
        tagStore.getById(tagId)
      );
    },
    get thumbPaths() {
      return self.fileIndexes.map((f) => f.file.thumbPaths[0]);
    },
  }))
  .actions((self) => ({
    update: (updates: Partial<typeof self>) => {
      applySnapshot(self, { ...self, ...updates });
    },
  }));

export interface FileCollection extends Instance<typeof FileCollectionModel> {}
