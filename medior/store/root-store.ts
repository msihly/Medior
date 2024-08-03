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
  carousel: prop<CarouselStore>(() => new CarouselStore({})),
  collection: prop<FileCollectionStore>(() => new FileCollectionStore({})),
  faceRecog: prop<FaceRecognitionStore>(() => new FaceRecognitionStore({})),
  file: prop<FileStore>(() => new FileStore({})),
  home: prop<HomeStore>(() => new HomeStore({})),
  import: prop<ImportStore>(() => new ImportStore({})),
  tag: prop<TagStore>(() => new TagStore({})),
  tagManager: prop<TagManagerStore>(() => new TagManagerStore({})),
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
  const rootStore = new RootStore({});
  registerRootStore(rootStore);
  return rootStore;
};

export const RootStoreContext = createContext<RootStore>({} as RootStore);

export const useStores = () => useContext<RootStore>(RootStoreContext);

export const observer = observerBase;
