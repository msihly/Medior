import { createContext, useContext } from "react";
import { model, Model, prop, registerRootStore } from "mobx-keystone";
import { CarouselStore } from "./carousel";
import { FileCollectionStore } from "./collections";
import { FaceRecognitionStore } from "./face-recognition";
import { FileStore } from "./files";
import { HomeStore } from "./home";
import { ImportStore } from "./imports";
import { TagStore } from "./tags";

@model("medior/RootStore")
export class RootStore extends Model({
  carouselStore: prop<CarouselStore>(),
  faceRecognitionStore: prop<FaceRecognitionStore>(),
  fileCollectionStore: prop<FileCollectionStore>(),
  fileStore: prop<FileStore>(),
  homeStore: prop<HomeStore>(),
  importStore: prop<ImportStore>(),
  tagStore: prop<TagStore>(),
}) {
  /* ----------------------------- DYNAMIC GETTERS ---------------------------- */
  getIsBlockingModalOpen() {
    return (
      this.faceRecognitionStore?.isModalOpen ||
      this.fileCollectionStore?.isEditorOpen ||
      this.fileCollectionStore?.isManagerOpen ||
      this.importStore?.isImportEditorOpen ||
      this.importStore?.isImportManagerOpen ||
      this.tagStore?.isTagEditorOpen ||
      this.tagStore?.isTaggerOpen ||
      this.tagStore?.isTagManagerOpen ||
      this.tagStore?.isTagMergerOpen
    );
  }
}

export const createRootStore = () => {
  const rootStore = new RootStore({
    carouselStore: new CarouselStore({}),
    faceRecognitionStore: new FaceRecognitionStore({}),
    fileCollectionStore: new FileCollectionStore({}),
    fileStore: new FileStore({}),
    homeStore: new HomeStore({}),
    importStore: new ImportStore({}),
    tagStore: new TagStore({}),
  });

  registerRootStore(rootStore);

  return rootStore;
};

export const RootStoreContext = createContext<RootStore>({} as RootStore);

export const useStores = () => useContext<RootStore>(RootStoreContext);
