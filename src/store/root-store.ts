import { createContext, useContext } from "react";
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { observer as observerBase } from "mobx-react-lite";
import { model, Model, prop, registerRootStore } from "mobx-keystone";
import { CarouselStore } from "./carousel";
import { FileCollectionStore } from "./collections";
import { FaceRecognitionStore } from "./face-recognition";
import { FileStore } from "./files";
import { HomeStore } from "./home";
import { ImportStore } from "./imports";
import { TagManagerStore, TagStore } from "./tags";

@model("medior/RootStore")
export class RootStore extends Model({
  carousel: prop<CarouselStore>(),
  collection: prop<FileCollectionStore>(),
  faceRecog: prop<FaceRecognitionStore>(),
  file: prop<FileStore>(),
  home: prop<HomeStore>(),
  import: prop<ImportStore>(),
  tag: prop<TagStore>(),
  tagManager: prop<TagManagerStore>(),
}) {
  /* ----------------------------- DYNAMIC GETTERS ---------------------------- */
  _getIsBlockingModalOpen() {
    return (
      this.collection?.isEditorOpen ||
      this.collection?.isManagerOpen ||
      this.faceRecog?.isModalOpen ||
      this.import?.isImportEditorOpen ||
      this.import?.isImportManagerOpen ||
      this.tag?.isFileTagEditorOpen ||
      this.tag?.isTagEditorOpen ||
      this.tag?.isTagMergerOpen ||
      this.tagManager?.isOpen
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
    tagManager: new TagManagerStore({}),
  });

  registerRootStore(rootStore);

  return rootStore;
};

export const RootStoreContext = createContext<RootStore>({} as RootStore);

export const useStores = () => useContext<RootStore>(RootStoreContext);

export const observer = observerBase;
