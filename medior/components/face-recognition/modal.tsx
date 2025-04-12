import { useEffect, useRef, useState } from "react";
import { ModelCreationData } from "mobx-keystone";
import {
  Button,
  Card,
  CenteredText,
  Comp,
  FileBase,
  Modal,
  TagInput,
  Text,
  View,
} from "medior/components";
import { FaceModel, useStores } from "medior/store";
import { colors, makeClasses, toast, useElementResize } from "medior/utils/client";
import { FaceBox } from ".";

type FaceModelWithImage = { dataUrl: string; faceModel: FaceModel };

export const FaceRecognitionModal = Comp(() => {
  const { css } = useClasses(null);

  const stores = useStores();

  const imageRef = useRef<HTMLImageElement>();

  const file = stores.file.getById(stores.faceRecog.activeFileId);
  const hasDetectedFaces = stores.faceRecog.detectedFaces?.length > 0;

  const [detectedFacesWithImages, setDetectedFacesWithImages] = useState<FaceModelWithImage[]>([]);
  useEffect(() => {
    const faceModels = stores.faceRecog.detectedFaces;
    if (!faceModels?.length) return;

    (async () => {
      setDetectedFacesWithImages(await addImagesToDetectedFaces(file.path, faceModels));
    })();
  }, [stores.faceRecog.detectedFaces.length]);

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

  const fileToDetectedFaces = (fileFaceModels: ModelCreationData<FaceModel>[]) => {
    try {
      const faceModels = fileFaceModels.map((face) => ({
        box: { ...face.box },
        descriptors: face.descriptors,
        fileId: face.fileId,
        tagId: face.tagId,
        selectedTag: stores.tag.getById(face.tagId)?.tagOption,
      }));

      return faceModels.map((face) => new FaceModel(face));
    } catch (error) {
      console.error(error);
    }
  };

  const handleClose = () => {
    stores.faceRecog.setDetectedFaces([]);
    stores.faceRecog.setIsModalOpen(false);
    stores.file.search.reloadIfQueued();
  };

  const handleDetect = async () => {
    try {
      if (stores.faceRecog.isDisabled) return;
      stores.faceRecog.setIsDetecting(true);

      const res = await stores.faceRecog.findMatches(file.path);
      const detectedFaces = res.data.map(
        // @ts-expect-error
        ({ detection: { _box: box }, descriptor, tagId }) =>
          new FaceModel({
            box: { height: box._height, width: box._width, x: box._x, y: box._y },
            descriptors: JSON.stringify([descriptor]),
            fileId: file.id,
            selectedTag: tagId ? stores.tag.getById(tagId)?.tagOption : null,
          }),
      );

      stores.faceRecog.setIsDetecting(false);
      if (detectedFaces.length === 0) return toast.warn("No new faces detected");
      stores.faceRecog.addDetectedFaces(detectedFaces);
    } catch (err) {
      stores.faceRecog.setIsDetecting(false);
      toast.error(err.message);
    }
  };

  const handleSave = async () => {
    const res = await stores.faceRecog.registerDetectedFaces();
    if (!res.success) toast.error(res.error);
    else {
      toast.success("Faces saved successfully!");
      handleClose();
    }
  };

  const loadFaceModels = async () => {
    try {
      const res = await stores.faceRecog.loadFaceModels({
        fileIds: [file.id],
        withOverwrite: false,
      });
      if (!res.success) throw new Error(res.error);
      stores.faceRecog.setDetectedFaces(fileToDetectedFaces(res.data));
    } catch (err) {
      console.error(err);
      toast.error("Failed to load file's face models");
    }
  };

  useEffect(() => {
    stores.faceRecog.init();
  }, []);

  useEffect(() => {
    if (stores.faceRecog.isModalOpen)
      setTimeout(() => {
        if (stores.faceRecog.isInitializing) return;
        if (file.hasFaceModels) loadFaceModels();
        else handleDetect();
      }, 100);
    else stores.faceRecog.setDetectedFaces([]);
  }, [stores.faceRecog.isModalOpen, stores.faceRecog.isInitializing]);

  useEffect(() => {
    if (!stores.faceRecog.isModalOpen) return;
    loadFaceModels();
  }, [stores.faceRecog.isModalOpen]);

  const imageDims = useElementResize(imageRef);
  const heightScale = (imageDims?.height || imageRef.current?.height) / file.height;
  const widthScale = (imageDims?.width || imageRef.current?.width) / file.width;
  const offsetLeft = imageRef.current?.offsetLeft || 0;
  const offsetTop = imageRef.current?.offsetTop || 0;

  return (
    <Modal.Container isLoading={stores.faceRecog.isDisabled} width="100%" height="100%">
      <Modal.Header>
        <Text preset="title">{"Face Recognition"}</Text>
      </Modal.Header>

      <Modal.Content>
        {stores.faceRecog.isInitializing ? (
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
                <img
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
          disabled={stores.faceRecog.isDisabled}
          colorOnHover={colors.custom.red}
        />

        <Button
          text={hasDetectedFaces ? "Redetect" : "Detect"}
          icon="Search"
          onClick={handleDetect}
          disabled={stores.faceRecog.isDisabled}
          colorOnHover={hasDetectedFaces ? colors.custom.purple : colors.custom.blue}
        />

        <Button
          text="Save"
          icon="Save"
          onClick={handleSave}
          disabled={!hasDetectedFaces || stores.faceRecog.isDisabled}
          color={colors.custom.green}
        />
      </Modal.Footer>
    </Modal.Container>
  );
});

const useClasses = makeClasses({
  image: {
    maxHeight: "100%",
    height: "fit-content",
    width: "100%",
    objectFit: "contain",
  },
  rootContainer: {
    maxHeight: "-webkit-fill-available",
  },
});
