import { model, Model, prop, registerRootStore } from "mobx-keystone";
import { FileCollectionStore } from "./collections";
import { FileStore } from "./files";
import { HomeStore } from "./home";
import { ImportStore } from "./imports";
import { TagStore } from "./tags";

@model("mediaViewer/RootStore")
export class RootStore extends Model({
  fileCollectionStore: prop<FileCollectionStore>(),
  fileStore: prop<FileStore>(),
  homeStore: prop<HomeStore>(),
  importStore: prop<ImportStore>(),
  tagStore: prop<TagStore>(),
}) {}

export const createRootStore = () => {
  const rootStore = new RootStore({
    fileCollectionStore: new FileCollectionStore({}),
    fileStore: new FileStore({}),
    homeStore: new HomeStore({}),
    importStore: new ImportStore({}),
    tagStore: new TagStore({}),
  });

  registerRootStore(rootStore);
  return rootStore;
};
