import { createContext, useContext } from "react";
import { Model, model, modelAction, prop, registerRootStore } from "mobx-keystone";
import * as mobx from "mobx-keystone";
import { initMobx } from "trabecula/utils/client";
import { isDeepEqual } from "medior/utils/common";
import { Config } from "medior/utils/server";
import { CarouselStore } from "./carousel";
import { FileCollectionStore } from "./collections";
import { FaceRecognitionStore } from "./face-recognition";
import { FileStore } from "./files";
import { HomeStore } from "./home";
import { ImportStore } from "./imports";
import { MediaProgramStore } from "./media-programs";
import { TagStore } from "./tags";

initMobx(mobx);

@model("medior/RootStore")
export class RootStore extends Model({
  carousel: prop<CarouselStore>(() => new CarouselStore({})),
  collection: prop<FileCollectionStore>(() => new FileCollectionStore({})),
  faceRecog: prop<FaceRecognitionStore>(() => new FaceRecognitionStore({})),
  file: prop<FileStore>(() => new FileStore({})),
  home: prop<HomeStore>(() => new HomeStore({})),
  import: prop<ImportStore>(() => new ImportStore({})),
  mediaProgram: prop<MediaProgramStore>(() => new MediaProgramStore({})),
  tag: prop<TagStore>(() => new TagStore({})),
}) {
  /**
   * Applies a saved config. Searches only take a default sort or page size that changed, so saving
   * any setting doesn't reset what every window's searches are showing.
   */
  @modelAction
  applyConfig(config: Config, previous: Config) {
    const isChanged = (getValue: (config: Config) => unknown) =>
      !isDeepEqual(getValue(config), getValue(previous));

    if (isChanged((c) => c.collection.editor.fileSearch.pageSize))
      this.collection.editor.fileSearch.setPageSize(config.collection.editor.fileSearch.pageSize);

    if (isChanged((c) => c.collection.editor.search.pageSize))
      this.collection.editor.search.setPageSize(config.collection.editor.search.pageSize);

    if (isChanged((c) => c.collection.editor.search.sort))
      this.collection.editor.search.setSortValue(config.collection.editor.search.sort);

    if (isChanged((c) => c.collection.manager.search.pageSize))
      this.collection.manager.search.setPageSize(config.collection.manager.search.pageSize);

    if (isChanged((c) => c.collection.manager.search.sort))
      this.collection.manager.search.setSortValue(config.collection.manager.search.sort);

    if (isChanged((c) => c.file.search.pageSize))
      this.file.search.setPageSize(config.file.search.pageSize);

    if (isChanged((c) => c.file.search.sort))
      this.file.search.setSortValue(config.file.search.sort);

    if (isChanged((c) => c.file.transforms.search.pageSize))
      this.file.videoTransformer.search.setPageSize(config.file.transforms.search.pageSize);

    if (isChanged((c) => c.file.transforms.search.sort))
      this.file.videoTransformer.search.setSortValue(config.file.transforms.search.sort);

    if (isChanged((c) => c.imports.manager.search.pageSize))
      this.import.manager.search.setPageSize(config.imports.manager.search.pageSize);

    if (isChanged((c) => c.imports.manager.search.sort))
      this.import.manager.search.setSortValue(config.imports.manager.search.sort);

    if (isChanged((c) => c.mediaPrograms.manager.search.pageSize))
      this.mediaProgram.manager.search.setPageSize(config.mediaPrograms.manager.search.pageSize);

    if (isChanged((c) => c.mediaPrograms.manager.search.sort))
      this.mediaProgram.manager.search.setSortValue(config.mediaPrograms.manager.search.sort);

    if (isChanged((c) => c.tags.manager.search.pageSize))
      this.tag.manager.search.setPageSize(config.tags.manager.search.pageSize);

    if (isChanged((c) => c.tags.manager.search.sort))
      this.tag.manager.search.setSortValue(config.tags.manager.search.sort);

    this.home.setFileCardFit(config.file.fileCardFit);
    this.home.setShowFileName(config.file.showFileName);
    this.home.settings.applyConfig(config);
  }

  /* ----------------------------- DYNAMIC GETTERS ---------------------------- */
  _getIsBlockingModalOpen() {
    return (
      this.collection?.editor?.isOpen ||
      this.collection?.manager?.isOpen ||
      this.faceRecog?.isModalOpen ||
      this.import?.ingester?.isOpen ||
      this.import?.manager?.isOpen ||
      this.import?.reingester?.isOpen ||
      (this.file?.lowerResolution?.isOpen && !this.file?.lowerResolution?.isMinimized) ||
      this.file?.similarity?.isOpen ||
      this.file?.tagsEditor?.isOpen ||
      (this.file?.isRefreshOpen && !this.file?.isRefreshMinimized) ||
      (this.file?.videoTransformer?.isOpen && !this.file?.videoTransformer?.isMinimized) ||
      this.mediaProgram?.editor?.isOpen ||
      this.mediaProgram?.manager?.isOpen ||
      this.tag?.editor?.isOpen ||
      this.tag?.merger?.isOpen ||
      (this.tag?.manager?.isOpen && !this.tag?.manager?.isMinimized)
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
