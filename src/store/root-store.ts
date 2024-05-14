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
  carousel: prop<CarouselStore>(),
  collection: prop<FileCollectionStore>(),
  faceRecog: prop<FaceRecognitionStore>(),
  file: prop<FileStore>(),
  home: prop<HomeStore>(),
  import: prop<ImportStore>(),
  tag: prop<TagStore>(),
}) {
  /* ----------------------------- DYNAMIC GETTERS ---------------------------- */
  _getIsBlockingModalOpen() {
    return (
      this.faceRecog?.isModalOpen ||
      this.collection?.isEditorOpen ||
      this.collection?.isManagerOpen ||
      this.import?.isImportEditorOpen ||
      this.import?.isImportManagerOpen ||
      this.tag?.isTagEditorOpen ||
      this.tag?.isTaggerOpen ||
      this.tag?.isTagManagerOpen ||
      this.tag?.isTagMergerOpen
    );
  }
}

export const createRootStore = () => {
  const rootStore = new RootStore({
    carousel: new CarouselStore({}),
    collection: new FileCollectionStore({}),
    faceRecog: new FaceRecognitionStore({}),
    file: new FileStore({}),
    home: new HomeStore({}),
    import: new ImportStore({}),
    tag: new TagStore({}),
  });

  registerRootStore(rootStore);

  return rootStore;
};

export const RootStoreContext = createContext<RootStore>({} as RootStore);

export const useStores = () => useContext<RootStore>(RootStoreContext);
