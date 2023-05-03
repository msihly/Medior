import { computed } from "mobx";
import { Model, model, modelAction, ModelCreationData, prop } from "mobx-keystone";
import { File } from ".";
import { CONSTANTS, IMAGE_EXT_REG_EXP, VIDEO_EXT_REG_EXP } from "utils";

@model("mediaViewer/FileStore")
export class FileStore extends Model({
  files: prop<File[]>(() => []),
  filteredFileIds: prop<string[]>(() => []),
  page: prop<number>(1).withSetter(),
  selectedIds: prop<string[]>(() => []),
}) {
  @modelAction
  append(files: ModelCreationData<File>[]) {
    this.files.push(
      ...files.reduce((acc, cur) => {
        const file = this.files.find((f) => f.id === cur.id);
        if (!file) acc.push(new File(cur));
        else file.update(cur);
        return acc;
      }, [])
    );
  }

  @modelAction
  appendFiltered(files: ModelCreationData<File>[], page = this.page) {
    const displayed = files.slice((page - 1) * CONSTANTS.FILE_COUNT, page * CONSTANTS.FILE_COUNT);
    this.append(displayed);
    this.filteredFileIds = files.map((f) => f.id);
  }

  @modelAction
  overwrite(files: ModelCreationData<File>[]) {
    this.files = files.map((f) => new File(f));
    this.filteredFileIds = files.map((f) => f.id);
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
    const displayedIds = this.filteredFileIds.slice(
      (this.page - 1) * CONSTANTS.FILE_COUNT,
      this.page * CONSTANTS.FILE_COUNT
    );

    return this.files.filter((f) => displayedIds.includes(f.id));
  }

  @computed
  get images() {
    return this.files.filter((f) => IMAGE_EXT_REG_EXP.test(f.ext));
  }

  @computed
  get pageCount() {
    return this.filteredFileIds.length < CONSTANTS.FILE_COUNT
      ? 1
      : Math.ceil(this.filteredFileIds.length / CONSTANTS.FILE_COUNT);
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
