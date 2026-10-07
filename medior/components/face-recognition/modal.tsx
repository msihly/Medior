import { useEffect, useRef, useState } from "react";
import { TagSchema } from "medior/_generated/server";
import { ModelCreationData } from "mobx-keystone";
import {
  Button,
  Card,
  CenteredText,
  Comp,
  FileBase,
  LoadingOverlay,
  Modal,
  TagInput,
  Text,
  View,
} from "medior/components";
import { FaceModel, tagToOption, useStores } from "medior/store";
import { colors, makeClasses, toast, useElementResize } from "medior/utils/client";
import { trpc } from "medior/utils/server";
import { FaceBox } from ".";

type FaceModelWithImage = { dataUrl: string; faceModel: FaceModel };

export const FaceRecognitionModal = Comp(() => {
  const stores = useStores();
  const store = stores.faceRecog;

  const { css } = useClasses(null);

  const [detectedFacesWithImages, setDetectedFacesWithImages] = useState<FaceModelWithImage[]>([]);
  const [isLoadingFaces, setIsLoadingFaces] = useState(false);

  const imageRef = useRef<HTMLImageElement>();
  const loadRevision = useRef(0);

  const file = stores.file.getById(store.activeFileId);
  const hasDetectedFaces = store.detectedFaces?.length > 0;

  useEffect(
    () => () => {
      loadRevision.current++;
    },
    [],
  );

  useEffect(() => {
    const faceModels = [...store.detectedFaces];
    let cancelled = false;

    const loadFaces = async () => {
      try {
        const faces = await addImagesToDetectedFaces(file.path, faceModels);

        if (!cancelled) setDetectedFacesWithImages(faces);
      } catch (error) {
        if (!cancelled) toast.error(error);
      }
    };

    if (!faceModels.length) setDetectedFacesWithImages([]);
    else loadFaces();

    return () => {
      cancelled = true;
    };
  }, [file.path, store.detectedFaces, store.detectedFaces.length]);

  const addImagesToDetectedFaces = (
    filePath: string,
    faceModels: FaceModel[],
  ): Promise<FaceModelWithImage[]> => {
    return new Promise((resolve, reject) => {
      const image = new Image();

      image.onload = () => {
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");

        if (!context) return reject(new Error("Could not create canvas context"));

        const faceModelsWithImages = faceModels.map((faceModel) => {
          const box = faceModel.box;

          canvas.width = box.width;
          canvas.height = box.height;
          context.clearRect(0, 0, canvas.width, canvas.height);
          context.drawImage(
            image,
            box.x,
            box.y,
            box.width,
            box.height,
            0,
            0,
            canvas.width,
            canvas.height,
          );

          return { dataUrl: canvas.toDataURL(), faceModel };
        });

        resolve(faceModelsWithImages);
      };

      image.onerror = () => {
        reject(new Error("Could not load image"));
      };

      image.src = filePath;
    });
  };

  const fileToDetectedFaces = async (fileFaceModels: ModelCreationData<FaceModel>[]) => {
    const tagIds = fileFaceModels.map((face) => face.tagId);
    const res = await trpc.listTag.mutate({ filter: { id: tagIds } });

    if (!res.success) throw new Error(res.error);

    const tagMap = new Map<string, TagSchema>(res.data.map((tag) => [tag.id, tag]));

    return fileFaceModels.map(
      (face) =>
        new FaceModel({
          box: { ...face.box },
          descriptors: face.descriptors,
          fileId: face.fileId,
          selectedTag: tagMap.has(face.tagId) ? tagToOption(tagMap.get(face.tagId)) : null,
          tagId: face.tagId,
        }),
    );
  };

  const handleClose = () => {
    if (store.isSaving) return;

    loadRevision.current++;
    store.setIsDetecting(false);
    store.setDetectedFaces([]);
    store.setIsModalOpen(false);
    stores.file.search.reloadIfQueued();
  };

  const handleDetect = async () => {
    if (store.isDisabled || isLoadingFaces) return;

    const revision = ++loadRevision.current;

    store.setIsDetecting(true);

    try {
      const res = await store.findMatches(file.path);

      if (revision !== loadRevision.current) return;

      if (!res.success) throw new Error(res.error);

      const tagIds = res.data.map((f) => f.tagId);
      const tagsRes = await trpc.listTag.mutate({ filter: { id: tagIds } });

      if (revision !== loadRevision.current) return;

      if (!tagsRes.success) throw new Error(tagsRes.error);

      const tagMap = new Map<string, TagSchema>(tagsRes.data.map((tag) => [tag.id, tag]));

      const detectedFaces = res.data.map(
        // @ts-no-check
        ({ detection: { _box: box }, descriptor, tagId }) =>
          new FaceModel({
            box: { height: box._height, width: box._width, x: box._x, y: box._y },
            descriptors: JSON.stringify([descriptor]),
            fileId: file.id,
            selectedTag: tagMap.has(tagId) ? tagToOption(tagMap.get(tagId)) : null,
          }),
      );

      store.setIsDetecting(false);

      if (detectedFaces.length === 0) return toast.warn("No new faces detected");

      store.addDetectedFaces(detectedFaces);
    } catch (err) {
      if (revision === loadRevision.current) {
        store.setIsDetecting(false);
        toast.error(err.message);
      }
    }
  };

  const handleSave = async () => {
    const res = await store.registerDetectedFaces();

    if (!res.success) toast.error(res.error);
    else {
      toast.success("Faces saved successfully!");
      handleClose();
    }
  };

  const loadFaceModels = async () => {
    const revision = ++loadRevision.current;

    setIsLoadingFaces(true);

    try {
      const res = await store.loadFaceModels({
        fileIds: [file.id],
        withOverwrite: false,
      });

      if (revision !== loadRevision.current) return;

      if (!res.success) throw new Error(res.error);

      const faces = await fileToDetectedFaces(res.data);

      if (revision === loadRevision.current) store.setDetectedFaces(faces);
    } catch (err) {
      if (revision === loadRevision.current) toast.error("Failed to load file's face models");
    } finally {
      if (revision === loadRevision.current) setIsLoadingFaces(false);
    }
  };

  useEffect(() => {
    if (store.isInitializing) store.init();
  }, []);

  useEffect(() => {
    if (!store.isInitializing) {
      if (file.hasFaceModels) loadFaceModels();
      else handleDetect();
    }
  }, [file.id, store.isInitializing]);

  const imageDims = useElementResize(imageRef);
  const heightScale = (imageDims?.height || imageRef.current?.height) / file.height;
  const widthScale = (imageDims?.width || imageRef.current?.width) / file.width;
  const offsetLeft = imageRef.current?.offsetLeft || 0;
  const offsetTop = imageRef.current?.offsetTop || 0;

  return (
    <Modal.Container isLoading={store.isSaving} onClose={handleClose} width="100%" height="100%">
      <LoadingOverlay
        isLoading={!store.isSaving && (store.isDisabled || isLoadingFaces)}
        sub={<Button text="Cancel" icon="Close" onClick={handleClose} />}
      />

      <Modal.Header>
        <Text preset="title">{"Face Recognition"}</Text>
      </Modal.Header>

      <Modal.Content>
        {store.isInitializing ? (
          <CenteredText text="Initializing..." />
        ) : (
          <View row flex={1} spacing="0.5rem" className={css.rootContainer}>
            <Card column height="100%" width="16rem" overflow="auto" spacing="0.5rem">
              {!detectedFacesWithImages?.length ? (
                <CenteredText text="No faces detected" />
              ) : (
                detectedFacesWithImages.map(({ dataUrl, faceModel: face }, i) => (
                  <FileBase.Container key={i} height="16rem" overflow="initial" disabled>
                    <FileBase.Image thumb={{ path: dataUrl }} height="100%" fit="contain" />

                    <View flex={0}>
                      <TagInput
                        value={face.selectedTag ? [face.selectedTag] : []}
                        onChange={(val) => face.setSelectedTag(val[0])}
                        inputProps={{ color: face.boxColor }}
                        single
                      />
                    </View>
                  </FileBase.Container>
                ))
              )}
            </Card>

            <Card
              column
              flex={1}
              align="center"
              justify="center"
              height="100%"
              width="100%"
              overflow="hidden"
              padding={{ all: 0 }}
            >
              <View column align="center" justify="center" height="100%" width="fit-content">
                <View
                  component="img"
                  ref={imageRef}
                  src={file?.path}
                  className={css.image}
                  alt={file?.originalName}
                  draggable={false}
                />

                {detectedFacesWithImages?.map?.(({ faceModel: face }, i) => (
                  <FaceBox key={i} {...{ face, heightScale, offsetLeft, offsetTop, widthScale }} />
                ))}
              </View>
            </Card>
          </View>
        )}
      </Modal.Content>

      <Modal.Footer>
        <Button
          text="Close"
          icon="Close"
          onClick={handleClose}
          disabled={store.isDisabled}
          colorOnHover={colors.custom.red}
        />

        <Button
          text={hasDetectedFaces ? "Redetect" : "Detect"}
          icon="Search"
          onClick={handleDetect}
          disabled={store.isDisabled}
          colorOnHover={hasDetectedFaces ? colors.custom.purple : colors.custom.blue}
        />

        <Button
          text="Save"
          icon="Save"
          onClick={handleSave}
          disabled={!hasDetectedFaces || store.isDisabled}
          color={colors.custom.green}
        />
      </Modal.Footer>
    </Modal.Container>
  );
});

const useClasses = makeClasses({
  image: {
    height: "fit-content",
    maxHeight: "100%",
    objectFit: "contain",
    width: "100%",
  },
  rootContainer: {
    maxHeight: "-webkit-fill-available",
  },
});
