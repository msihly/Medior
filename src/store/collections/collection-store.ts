import { computed } from "mobx";
import { model, Model, modelAction, prop } from "mobx-keystone";
import { FileCollection } from ".";

@model("mediaViewer/FileCollectionStore")
export class FileCollectionStore extends Model({
  activeCollectionId: prop<string>(null).withSetter(),
  activeFileId: prop<string>(null).withSetter(),
  collections: prop<FileCollection[]>(() => []).withSetter(),
  isCollectionManagerOpen: prop<boolean>(false),
  isCollectionEditorOpen: prop<boolean>(false),
}) {
  @modelAction
  setIsCollectionEditorOpen(isOpen: boolean) {
    this.isCollectionEditorOpen = isOpen;
    if (isOpen) this.isCollectionManagerOpen = false;
  }

  @modelAction
  setIsCollectionManagerOpen(isOpen: boolean) {
    this.isCollectionManagerOpen = isOpen;
    if (isOpen) this.isCollectionEditorOpen = false;
  }

  getById(id: string) {
    return this.collections.find((c) => c.id === id);
  }

  listByFileId(id: string) {
    return this.collections.filter((c) => c.fileIdIndexes.find((f) => f.fileId === id));
  }

  @computed
  get activeCollection() {
    return this.collections.find((c) => c.id === this.activeCollectionId);
  }
}
