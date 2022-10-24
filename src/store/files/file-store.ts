import { computed } from "mobx";
import {
  applySnapshot,
  arrayActions,
  Model,
  model,
  modelAction,
  ModelCreationData,
  prop,
} from "mobx-keystone";
import { File, IMAGE_EXT_REG_EXP, VIDEO_EXT_REG_EXP } from ".";
import { toast } from "react-toastify";

@model("mediaViewer/FileStore")
export class FileStore extends Model({
  files: prop<File[]>(() => []),
}) {
  @modelAction
  addFiles(...files: File[]) {
    this.files.push(...files.map((f) => new File({ ...f, isSelected: false })));
  }

  @modelAction
  archiveFiles(fileIds: string[], isUnarchive = false) {
    if (!fileIds?.length) return false;
    this.files.forEach((f) => {
      if (fileIds.includes(f.id)) f.isArchived = !isUnarchive;
    });
    toast.warning(`${isUnarchive ? "Unarchived" : "Archived"} ${fileIds.length} files`);
  }

  @modelAction
  deleteFiles(fileIds: string[]) {
    if (!fileIds?.length) return false;
    this.files = this.files.filter((f) => !fileIds.includes(f.id));
    toast.error(`Deleted ${fileIds.length} files`);
  }

  @modelAction
  overwrite(files: Omit<ModelCreationData<File>, "isSelected">[]) {
    this.files = files.map((f) => new File({ ...f, isSelected: false }));
  }

  @modelAction
  toggleFilesSelected(fileIds: string[], selected: boolean = null) {
    this.files.forEach((f) => {
      if (fileIds.includes(f.id)) f.isSelected = selected ?? !f.isSelected;
    });
  }

  getById(id: string) {
    return this.files.find((f) => f.id === id);
  }

  listByHash(hash: string) {
    return this.files.filter((f) => f.hash === hash);
  }

  listByTagId(tagId: string) {
    return this.files.filter((f) => f.tagIds.includes(tagId));
  }

  @computed
  get archived() {
    return this.files.filter((f) => f.isArchived);
  }

  @computed
  get images() {
    return this.files.filter((f) => IMAGE_EXT_REG_EXP.test(f.ext));
  }

  @computed
  get selected() {
    return this.files.filter((f) => f.isSelected);
  }

  @computed
  get videos() {
    return this.files.filter((f) => VIDEO_EXT_REG_EXP.test(f.ext));
  }
}
