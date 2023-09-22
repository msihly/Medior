import * as faceapi from "@vladmandic/face-api";
import { computed } from "mobx";
import {
  _async,
  _await,
  arrayActions,
  Model,
  model,
  modelAction,
  modelFlow,
  prop,
} from "mobx-keystone";
import { File, RootStore } from "store";
import { FaceModel } from ".";
import { handleErrors, IMAGE_EXT_REG_EXP, objectToFloat32Array, PromiseQueue, trpc } from "utils";
import { toast } from "react-toastify";

const DISTANCE_THRESHOLD = 0.4;

@model("mediaViewer/FaceRecognitionStore")
export class FaceRecognitionStore extends Model({
  activeFileId: prop<string | null>(null).withSetter(),
  detectedFaces: prop<FaceModel[]>(() => []).withSetter(),
  faceModels: prop<FaceModel[]>(() => []).withSetter(),
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
  addFilesToAutoDetectQueue = _async(function* (
    this: FaceRecognitionStore,
    { fileIds, rootStore }: { fileIds: string[]; rootStore: RootStore }
  ) {
    return yield* _await(
      handleErrors(async () => {
        let completedCount = 0;
        const totalCount = fileIds.length;

        const toastId = toast.info(
          () => `Auto Face Detection: ${completedCount} / ${totalCount}...`,
          { autoClose: false }
        );

        try {
          const filesRes = await trpc.listFiles.mutate({ ids: fileIds });
          if (!filesRes?.success) throw new Error("Failed to load files");

          const images = filesRes.data.filter((f) => IMAGE_EXT_REG_EXP.test(f.ext));
          if (!images.length) throw new Error("No images found");

          if (this.isInitializing) {
            const initRes = await this.init();
            if (!initRes.success) throw new Error(`Init error: ${initRes.error}`);
          }

          filesRes.data.map((file) =>
            this.autoDetectQueue.add(async () => {
              try {
                this.setDetectedFaces(file.faceModels?.map?.((f) => new FaceModel(f)) ?? []);

                const matchesRes = await this.findMatches(file.path);
                if (!matchesRes.success)
                  throw new Error(`Error finding matches: ${matchesRes.error}`);

                this.addDetectedFaces(
                  matchesRes.data.map(
                    // @ts-expect-error
                    ({ detection: { _box: box }, descriptor, tagId }) =>
                      new FaceModel({
                        box: { height: box._height, width: box._width, x: box._x, y: box._y },
                        descriptors: JSON.stringify([descriptor]),
                        fileId: file.id,
                        tagId,
                      })
                  )
                );

                const registerRes = await this.registerDetectedFaces({
                  file: new File({
                    ...file,
                    faceModels: file.faceModels?.map?.((face) => new FaceModel(face)) ?? [],
                  }),
                  rootStore,
                });
                if (!registerRes.success)
                  throw new Error(`Error registering faces: ${registerRes.error}`);

                completedCount++;
                const isComplete = completedCount === totalCount;

                toast.update(toastId, {
                  autoClose: isComplete ? 5000 : false,
                  render: `Auto Face Detection: ${completedCount} / ${totalCount}${
                    isComplete ? "." : "..."
                  }`,
                });
              } catch (error) {
                console.error(error);
              }
            })
          );
        } catch (error) {
          return toast.update(toastId, {
            autoClose: 5000,
            render: `Auto Face Detection: ${error.message}`,
            type: "error",
          });
        }
      })
    );
  });

  @modelFlow
  detectFaces = _async(function* (this: FaceRecognitionStore, imagePath: string) {
    return yield* _await(
      handleErrors(async () => {
        const res = await trpc.detectFaces.mutate({ imagePath });
        if (!res.success) throw new Error(res.error);
        return res.data;
      })
    );
  });

  @modelFlow
  findMatches = _async(function* (this: FaceRecognitionStore, imagePath: string) {
    return yield* _await(
      handleErrors(async () => {
        const facesRes = await this.detectFaces(imagePath);
        if (!facesRes.success) throw new Error(facesRes.error);

        const storedDescriptors = this.faceModels.flatMap(
          (m) => new faceapi.LabeledFaceDescriptors(m.tagId, m.descriptorsFloat32)
        );
        if (!storedDescriptors.length) return [];

        const matcher = new faceapi.FaceMatcher(storedDescriptors, DISTANCE_THRESHOLD);
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
      })
    );
  });

  @modelFlow
  init = _async(function* (this: FaceRecognitionStore) {
    return yield* _await(
      handleErrors(async () => {
        const netsRes = await trpc.loadFaceApiNets.mutate();
        if (!netsRes.success) throw new Error(netsRes.error);
        const faceModelsRes = await this.loadFaceModels();
        if (!faceModelsRes.success) throw new Error(faceModelsRes.error);
        this.setIsInitializing(false);
      })
    );
  });

  @modelFlow
  loadFaceModels = _async(function* (this: FaceRecognitionStore) {
    return yield* _await(
      handleErrors(async () => {
        const res = await trpc.listFaceModels.mutate();
        if (!res.success) throw new Error(res.error);
        this.setFaceModels(res.data.map((f) => new FaceModel(f)));
      })
    );
  });

  @modelFlow
  registerDetectedFaces = _async(function* (
    this: FaceRecognitionStore,
    { file, rootStore }: { file?: File; rootStore: RootStore }
  ) {
    return yield* _await(
      handleErrors(async () => {
        this.setIsSaving(true);

        file = file ?? rootStore.fileStore.getById(this.activeFileId);

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
          await rootStore.fileStore.editFileTags({
            addedTagIds: newTagIds,
            fileIds: [file.id],
            rootStore,
          });

        this.setIsSaving(false);
        return this.faceModels;
      })
    );
  });

  /* --------------------------------- GETTERS -------------------------------- */
  @computed
  get isDisabled() {
    return this.isInitializing || this.isSaving;
  }
}
