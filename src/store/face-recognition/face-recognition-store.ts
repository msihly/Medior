import type { LabeledFaceDescriptors } from "@vladmandic/face-api";
import { LoadFaceModelsInput } from "database";
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
import { getConfig, handleErrors, objectToFloat32Array, PromiseQueue, trpc } from "utils";
import { toast } from "react-toastify";

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
          const filesRes = await trpc.listFiles.mutate({ ids: fileIds, withFaceModels: true });
          if (!filesRes?.success) throw new Error("Failed to load files");

          const imageExtRegExp = new RegExp(`${getConfig().file.imageTypes.join("|")}`, "i");
          const images = filesRes.data.filter((f) => imageExtRegExp.test(f.ext));
          if (!images.length) throw new Error("No images found");

          if (this.isInitializing) {
            const initRes = await this.init();
            if (!initRes.success) throw new Error(`Init error: ${initRes.error}`);
          }

          images.map((file) =>
            this.autoDetectQueue.add(async () => {
              try {
                this.setDetectedFaces(file.faceModels?.map?.((f) => new FaceModel(f)) ?? []);

                const matchesRes = await this.findMatches(file.path);
                if (!matchesRes.success)
                  throw new Error(`Error finding matches: ${matchesRes.error}`);

                this.addDetectedFaces(
                  matchesRes.data.map(
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
                  file: new File(file),
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
        this.setIsDetecting(true);

        const { FaceMatcher, LabeledFaceDescriptors } = await import("@vladmandic/face-api");

        const facesRes = await this.detectFaces(imagePath);
        if (!facesRes.success) throw new Error(facesRes.error);

        this.setIsDetecting(false);

        const storedDescriptors = this.faceModels.reduce((acc, cur) => {
          if (cur.descriptorsFloat32.some((d) => d.some((n) => isNaN(n))))
            console.error(
              `NaN found in descriptors for fileId ${cur.fileId}`,
              cur.descriptorsFloat32
            );
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
  loadFaceModels = _async(function* (
    this: FaceRecognitionStore,
    { fileIds, withOverwrite = true }: LoadFaceModelsInput = { withOverwrite: true }
  ) {
    return yield* _await(
      handleErrors(async () => {
        const res = await trpc.listFaceModels.mutate({ ids: fileIds });
        if (!res.success) throw new Error(res.error);
        if (withOverwrite) this.setFaceModels(res.data.map((f) => new FaceModel(f)));
        return res.data;
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
          await rootStore.fileStore.editFileTags({ addedTagIds: newTagIds, fileIds: [file.id] });

        this.setIsSaving(false);
        return this.faceModels;
      })
    );
  });

  /* --------------------------------- GETTERS -------------------------------- */
  @computed
  get isDisabled() {
    return this.isDetecting || this.isInitializing || this.isSaving;
  }
}
