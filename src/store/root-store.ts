// import * as remoteDev from "remotedev";
import { model, Model, prop, registerRootStore } from "mobx-keystone";
import { CarouselStore } from "./carousel";
import { FileCollectionStore } from "./collections";
import { FaceRecognitionStore } from "./face-recognition";
import { FileStore } from "./files";
import { HomeStore } from "./home";
import { ImportStore } from "./imports";
import { TagStore } from "./tags";

@model("mediaViewer/RootStore")
export class RootStore extends Model({
  carouselStore: prop<CarouselStore>(),
  faceRecognitionStore: prop<FaceRecognitionStore>(),
  fileCollectionStore: prop<FileCollectionStore>(),
  fileStore: prop<FileStore>(),
  homeStore: prop<HomeStore>(),
  importStore: prop<ImportStore>(),
  tagStore: prop<TagStore>(),
}) {}

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

  // if (import.meta.env.DEV)
  //   connectReduxDevTools(
  //     remoteDev,
  //     remoteDev.connectViaExtension({ name: "RootStore" }),
  //     rootStore
  //   );

  return rootStore;
};
