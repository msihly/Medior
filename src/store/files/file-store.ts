import { computed } from "mobx";
import { Model, model, modelAction, ModelCreationData, prop } from "mobx-keystone";
import { File } from ".";
import { CONSTANTS, IMAGE_EXT_REG_EXP, VIDEO_EXT_REG_EXP } from "utils";

@model("mediaViewer/FileStore")
export class FileStore extends Model({
  files: prop<File[]>(() => []),
  filteredFileIds: prop<string[]>(() => []).withSetter(),
  page: prop<number>(1).withSetter(),
  pageCount: prop<number>(1).withSetter(),
  selectedIds: prop<string[]>(() => []),
}) {
  @modelAction
  appendFiles(files: ModelCreationData<File>[]) {
    this.files.push(
      ...files.reduce((acc, cur) => {
        if (!this.files.find((f) => f.id === cur.id)) acc.push(new File(cur));
        return acc;
      }, [])
    );
  }

  @modelAction
  overwrite(files: ModelCreationData<File>[]) {
    this.files = files.map((f) => new File(f));
  }

  @modelAction
  toggleFilesSelected(selected: { id: string; isSelected?: boolean }[]) {
    const [added, removed] = selected.reduce(
      (acc, cur) => (acc[cur.isSelected ? 0 : 1].push(cur.id), acc),
      [[], []]
    );
    this.selectedIds = [...new Set(this.selectedIds.concat(added))].filter(
      (id) => !removed.includes(id)
    );
  }

  getIsSelected(id: string) {
    return !!this.selectedIds.find((s) => s === id);
  }

  getById(id: string) {
    return this.files.find((f) => f.id === id);
  }

  listByHash(hash: string) {
    return this.files.filter((f) => f.hash === hash);
  }

  listByIds(ids: string[]) {
    return this.files.filter((f) => ids.includes(f.id));
  }

  listByTagId(tagId: string) {
    return this.files.filter((f) => f.tagIds.includes(tagId));
  }

  @computed
  get archived() {
    return this.files.filter((f) => f.isArchived);
  }

  @computed
  get displayed() {
    return this.files
      .filter((f) => this.filteredFileIds.includes(f.id))
      .slice((this.page - 1) * CONSTANTS.FILE_COUNT, this.page * CONSTANTS.FILE_COUNT);
  }

  @computed
  get images() {
    return this.files.filter((f) => IMAGE_EXT_REG_EXP.test(f.ext));
  }

  @computed
  get selected() {
    return this.files.filter((f) => this.selectedIds.includes(f.id));
  }

  @computed
  get videos() {
    return this.files.filter((f) => VIDEO_EXT_REG_EXP.test(f.ext));
  }
}
