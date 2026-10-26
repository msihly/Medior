import { reaction } from "mobx";
import {
  ExtendedModel,
  getRootStore,
  model,
  modelAction,
  modelFlow,
  objectToMapTransform,
  prop,
} from "mobx-keystone";
import { _FileCollectionSearch } from "medior/store/_generated";
import { File, RootStore } from "medior/store";
import { asyncAction, loadFilesWithTags } from "medior/utils/client";

@model("medior/FileCollectionSearch")
export class FileCollectionSearch extends ExtendedModel(_FileCollectionSearch, {
  _maxSize: prop<number>(null),
  _minSize: prop<number>(null),
  files: prop<Record<string, File>>(() => ({}))
    .withTransform(objectToMapTransform<File>())
    .withSetter(),
}) {
  private fileLoadRevision = 0;
  /** The page load during which a file load set `isLoading`, which the latest file load clears. */
  private pendingFileLoadId: number = null;

  onInit() {
    super.onInit();

    reaction(
      () => [this.results, getRootStore<RootStore>(this)?.collection.manager.currentCollections],
      () => this.loadFiles(),
    );
  }

  private endFileLoad() {
    // A page load started since then owns `isLoading` and clears it itself.
    if (this.pendingFileLoadId === this.loadId) this.setIsLoading(false);

    this.pendingFileLoadId = null;
  }

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  _reset() {
    this.reset();
    this._maxSize = null;
    this._minSize = null;
  }

  @modelAction
  _setMaxSize(val: number) {
    this.setMaxSize(Number.isFinite(val) ? val * 1024 : null);
    this._maxSize = val;
  }

  @modelAction
  _setMinSize(val: number) {
    this.setMinSize(Number.isFinite(val) ? val * 1024 : null);
    this._minSize = val;
  }

  @modelAction
  afterApplySearchProps(searchProps: Record<string, any>) {
    this._maxSize = Number.isFinite(searchProps.maxSize) ? searchProps.maxSize / 1024 : null;
    this._minSize = Number.isFinite(searchProps.minSize) ? searchProps.minSize / 1024 : null;
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  /** Loads the preview files of the shown collections, unless they are all loaded already. */
  @modelFlow
  loadFiles = asyncAction(async () => {
    const stores = getRootStore<RootStore>(this);

    const loadId = this.loadId;
    const revision = ++this.fileLoadRevision;
    const fileIds = [
      ...new Set(
        [...this.results, ...stores.collection.manager.currentCollections]
          .map((c) => c.previewIds)
          .flat(),
      ),
    ];

    if (!fileIds.length) {
      this.setFiles(new Map());
      this.endFileLoad();
    } else if (fileIds.every((fileId) => this.files.has(fileId))) {
      // Removing collections, or updating them in place, keeps the previews already loaded.
      this.endFileLoad();
    } else {
      this.pendingFileLoadId = loadId;
      this.setIsLoading(true);

      try {
        const files = await loadFilesWithTags(fileIds);

        if (loadId === this.loadId && revision === this.fileLoadRevision) {
          this.setFiles(new Map(files.map((file) => [file.id, new File(file)])));
          this.endFileLoad();
        }
      } catch (error) {
        if (loadId === this.loadId && revision === this.fileLoadRevision) {
          this.endFileLoad();

          throw error;
        }
      }
    }
  });
}
