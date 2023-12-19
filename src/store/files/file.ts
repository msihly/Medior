import { computed } from "mobx";
import {
  applySnapshot,
  getRootStore,
  getSnapshot,
  Model,
  model,
  modelAction,
  ModelCreationData,
  prop,
} from "mobx-keystone";
import { FaceModel, RootStore, Tag } from "store";
import { File as MongoFile } from "database";
import { ANIMATED_EXT_REG_EXP, dayjs, VIDEO_EXT_REG_EXP } from "utils";

export const mongoFileToMobX = (file: MongoFile): ModelCreationData<File> => ({
  ...file,
  faceModels:
    file.faceModels?.map?.(
      (face) =>
        new FaceModel({ ...face, descriptors: JSON.stringify(face.descriptors), fileId: file.id })
    ) ?? [],
});

@model("mediaViewer/File")
export class File extends Model({
  dateCreated: prop<string>(),
  dateModified: prop<string>(),
  diffusionParams: prop<string>(null),
  duration: prop<number>(null),
  ext: prop<string>(),
  faceModels: prop<FaceModel[] | null>(null),
  frameRate: prop<number>(null),
  hash: prop<string>(),
  height: prop<number>(),
  id: prop<string>(),
  isArchived: prop<boolean>(),
  originalHash: prop<string>(null),
  originalName: prop<string>(null),
  originalPath: prop<string>(),
  path: prop<string>(),
  rating: prop<number>(),
  size: prop<number>(),
  tagIds: prop<string[]>(null),
  thumbPaths: prop<string[]>(null),
  width: prop<number>(),
}) {
  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  update(
    file: Partial<
      Omit<ModelCreationData<File>, "faceModels"> & { faceModels?: ModelCreationData<FaceModel>[] }
    >
  ) {
    const prev = getSnapshot(this);

    applySnapshot(this, {
      ...prev,
      ...file,
      faceModels: file.faceModels
        ? file.faceModels.map((f) => getSnapshot(new FaceModel(f)))
        : prev.faceModels,
    });
  }

  @modelAction
  updateTags({
    addedTagIds,
    dateModified = dayjs().toISOString(),
    removedTagIds,
  }: {
    addedTagIds?: string[];
    dateModified?: string;
    removedTagIds?: string[];
  }) {
    this.tagIds = this.tagIds
      .filter((tagId) => !removedTagIds?.includes(tagId))
      .concat(addedTagIds?.filter?.((tagId) => !this.tagIds.includes(tagId)) ?? []);
    this.dateModified = dateModified;
  }

  /* ----------------------------- GETTERS ----------------------------- */
  @computed
  get isAnimated() {
    return ANIMATED_EXT_REG_EXP.test(this.ext);
  }

  @computed
  get isVideo() {
    return VIDEO_EXT_REG_EXP.test(this.ext);
  }

  @computed
  get tags() {
    const rootStore = getRootStore<RootStore>(this);
    if (!rootStore) return [];

    return this.tagIds.reduce((acc, cur) => {
      const tag = rootStore.tagStore.getById(cur);
      if (tag) acc.push(tag);
      return acc;
    }, [] as Tag[]);
  }

  @computed
  get totalFrames() {
    return this.frameRate * this.duration;
  }
}
