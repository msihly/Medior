import type { LabeledFaceDescriptors } from "@vladmandic/face-api";
import { LoadFaceModelsInput } from "medior/database";
import { computed } from "mobx";
import {
  arrayActions,
  getRootStore,
  Model,
  model,
  modelAction,
  modelFlow,
  prop,
} from "mobx-keystone";
import { asyncAction, File, RootStore } from "medior/store";
import { FaceModel } from ".";
import { getConfig, makeQueue, objectToFloat32Array, PromiseQueue, trpc } from "medior/utils";

const DISTANCE_THRESHOLD = 0.45;

@model("medior/FaceRecognitionStore")
export class FaceRecognitionStore extends Model({
  activeFileId: prop<string | null>(null).withSetter(),
  detectedFaces: prop<FaceModel[]>(() => []).withSetter(),
  faceModels: prop<FaceModel[]>(() => []).withSetter(),
  isDetecting: prop<boolean>(false).withSetter(),
  isInitializing: prop<boolean>(true).withSetter(),
  isModalOpen: prop<boolean>(false).withSetter(),
  isSaving: prop<boolean>(false).withSetter(),
}) {
  autoDetectQueue = new PromiseQueue();

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  addDetectedFaces(detectedFaces: FaceModel[]) {
    arrayActions.push(
      this.detectedFaces,
      ...detectedFaces.filter(
        ({ box }) =>
          !this.detectedFaces.some(({ box: b }) => JSON.stringify(b) === JSON.stringify(box))
      )
    );
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  addFilesToAutoDetectQueue = asyncAction(async (fileIds: string[]) => {
    const filesRes = await trpc.listFiles.mutate({ ids: fileIds, withFaceModels: true });
    if (!filesRes?.success) throw new Error("Failed to load files");

    const imageExtRegExp = new RegExp(`${getConfig().file.imageTypes.join("|")}`, "i");
    const images = filesRes.data.filter((f) => imageExtRegExp.test(f.ext));
    if (!images.length) throw new Error("No images found");

    if (this.isInitializing) {
      const initRes = await this.init();
      if (!initRes.success) throw new Error(`Init error: ${initRes.error}`);
    }

    makeQueue({
      action: async (item) => {
        this.setDetectedFaces(item.faceModels?.map?.((f) => new FaceModel(f)) ?? []);

        const matchesRes = await this.findMatches(item.path);
        if (!matchesRes.success) throw new Error(`Error finding matches: ${matchesRes.error}`);

        this.addDetectedFaces(
          matchesRes.data.map(
            ({ detection: { _box: box }, descriptor, tagId }) =>
              new FaceModel({
                box: { height: box._height, width: box._width, x: box._x, y: box._y },
                descriptors: JSON.stringify([descriptor]),
                fileId: item.id,
                tagId,
              })
          )
        );

        const registerRes = await this.registerDetectedFaces(new File(item));
        if (!registerRes.success) throw new Error(`Error registering faces: ${registerRes.error}`);
      },
      items: images,
      logPrefix: "Facial Recognition:",
      logSuffix: "images",
      onComplete: () => null,
      queue: this.autoDetectQueue,
    });
  });

  @modelFlow
  detectFaces = asyncAction(async (imagePath: string) => {
    const res = await trpc.detectFaces.mutate({ imagePath });
    if (!res.success) throw new Error(res.error);
    return res.data;
  });

  @modelFlow
  findMatches = asyncAction(async (imagePath: string) => {
    this.setIsDetecting(true);

    const { FaceMatcher, LabeledFaceDescriptors } = await import("@vladmandic/face-api");

    const facesRes = await this.detectFaces(imagePath);
    if (!facesRes.success) throw new Error(facesRes.error);

    this.setIsDetecting(false);

    const storedDescriptors = this.faceModels.reduce((acc, cur) => {
      if (cur.descriptorsFloat32.some((d) => d.some((n) => isNaN(n))))
        console.error(`NaN found in descriptors for fileId ${cur.fileId}`, cur.descriptorsFloat32);
      else acc.push(new LabeledFaceDescriptors(cur.tagId, cur.descriptorsFloat32));
      return acc;
    }, [] as LabeledFaceDescriptors[]);

    if (!storedDescriptors.length)
      return facesRes.data.map((f) => ({
        descriptor: objectToFloat32Array(f.descriptor),
        detection: null,
        distance: null,
        tagId: null,
      }));

    const matcher = new FaceMatcher(storedDescriptors, DISTANCE_THRESHOLD);
    return facesRes.data.map((f) => {
      const descriptor = objectToFloat32Array(f.descriptor);
      const match = matcher.findBestMatch(descriptor);
      return {
        descriptor,
        detection: f.detection,
        distance: match?.distance,
        tagId: match?.label !== "unknown" ? match?.label : null,
      };
    });
  });

  @modelFlow
  init = asyncAction(async () => {
    const netsRes = await trpc.loadFaceApiNets.mutate();
    if (!netsRes.success) throw new Error(netsRes.error);
    const faceModelsRes = await this.loadFaceModels();
    if (!faceModelsRes.success) throw new Error(faceModelsRes.error);
    this.setIsInitializing(false);
  });

  @modelFlow
  loadFaceModels = asyncAction(
    async ({ fileIds, withOverwrite = true }: LoadFaceModelsInput = { withOverwrite: true }) => {
      const res = await trpc.listFaceModels.mutate({ ids: fileIds });
      if (!res.success) throw new Error(res.error);
      if (withOverwrite) this.setFaceModels(res.data.map((f) => new FaceModel(f)));
      return res.data;
    }
  );

  @modelFlow
  registerDetectedFaces = asyncAction(async (file?: File) => {
    this.setIsSaving(true);

    const stores = getRootStore<RootStore>(this);
    if (!file) file = stores.file.getById(this.activeFileId);

    const faceModels = this.detectedFaces
      .filter((f) => f.selectedTag !== null || f.tagId !== null)
      .map((f) => ({
        box: { ...f.box },
        descriptors: f.descriptors,
        fileId: file.id,
        tagId: f.selectedTag?.id ?? f.tagId,
      }));

    const res = await trpc.setFileFaceModels.mutate({ faceModels, id: file.id });
    if (!res.success) throw new Error(res.error);

    await this.loadFaceModels();

    const newTagIds = faceModels.reduce((acc, cur) => {
      if (!file.tagIds.includes(cur.tagId)) acc.push(cur.tagId);
      return acc;
    }, []);

    if (newTagIds.length > 0)
      await stores.file.editFileTags({ addedTagIds: newTagIds, fileIds: [file.id] });

    this.setIsSaving(false);
    return this.faceModels;
  });

  /* --------------------------------- GETTERS -------------------------------- */
  @computed
  get isDisabled() {
    return this.isDetecting || this.isInitializing || this.isSaving;
  }
}
