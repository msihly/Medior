import { computed } from "mobx";
import {
  applySnapshot,
  getRootStore,
  getSnapshot,
  Model,
  model,
  modelAction,
  prop,
} from "mobx-keystone";
import { RootStore } from "store";

export type FileIdIndex = {
  fileId: string;
  index: number;
};

@model("mediaViewer/FileCollection")
export class FileCollection extends Model({
  fileIdIndexes: prop<FileIdIndex[]>(),
  id: prop<string>(),
  title: prop<string>(),
}) {
  @modelAction
  update(tag: Partial<FileCollection>) {
    applySnapshot(this, { ...getSnapshot(this), ...tag });
  }

  @computed
  get fileIndexes() {
    const { fileStore } = getRootStore<RootStore>(this);
    return this.fileIdIndexes.map(({ fileId, index }) => ({
      file: fileStore.getById(fileId),
      index,
    }));
  }

  @computed
  get rating() {
    const ratingTotals = this.fileIndexes.reduce(
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
  }

  @computed
  get tags() {
    const { tagStore } = getRootStore<RootStore>(this);
    return [...new Set(this.fileIndexes.flatMap((f) => f.file.tagIds))].map((tagId) =>
      tagStore.getById(tagId)
    );
  }

  @computed
  get thumbPaths() {
    return this.fileIndexes.map((f) => f.file.thumbPaths[0]);
  }
}
