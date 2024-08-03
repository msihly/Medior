import { useEffect, useRef, useState } from "react";
import { ModelCreationData } from "mobx-keystone";
import { FaceModel, observer, useStores } from "medior/store";
import { CircularProgress } from "@mui/material";
import { Button, Modal, TagInput, Text, View } from "medior/components";
import { FaceBox } from ".";
import { colors, makeClasses, useElementResize } from "medior/utils";
import { toast } from "react-toastify";
import Color from "color";

type FaceModelWithImage = { dataUrl: string; faceModel: FaceModel };

export const FaceRecognitionModal = observer(() => {
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
    faceModels: FaceModel[]
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
            canvas.height
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
    stores.home.reloadIfQueued();
  };

  const handleDetect = async () => {
    try {
      if (stores.faceRecog.isDisabled) return;

      const res = await stores.faceRecog.findMatches(file.path);
      const detectedFaces = res.data.map(
        ({ detection: { _box: box }, descriptor, tagId }) =>
          new FaceModel({
            box: { height: box._height, width: box._width, x: box._x, y: box._y },
            descriptors: JSON.stringify([descriptor]),
            fileId: file.id,
            selectedTag: tagId ? stores.tag.getById(tagId)?.tagOption : null,
          })
      );

      if (detectedFaces.length === 0) return toast.warn("No new faces detected");

      stores.faceRecog.addDetectedFaces(detectedFaces);
    } catch (err) {
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
    <Modal.Container width="100%" height="100%">
      <Modal.Header>
        <Text>{"Face Recognition"}</Text>
      </Modal.Header>

      <Modal.Content>
        {stores.faceRecog.isInitializing ? (
          <View justify="center" align="center" className={css.rootContainer}>
            <Text fontSize="1.2em" marginRight="1rem">
              {"Initializing..."}
            </Text>
            <CircularProgress size="1.5em" />
          </View>
        ) : (
          <View className={css.rootContainer}>
            <View className={css.facesColumn}>
              {detectedFacesWithImages?.map?.(({ dataUrl, faceModel: face }, i) => (
                <View key={i} className={css.faceCard}>
                  <img src={dataUrl} draggable={false} />

                  <TagInput
                    value={face.selectedTag ? [face.selectedTag] : []}
                    onChange={(val) => face.setSelectedTag(val[0])}
                    inputProps={{ color: face.boxColor, margins: { top: "0.4rem" } }}
                    hasCreate
                    center
                    fullWidth
                  />
                </View>
              ))}
            </View>

            <View className={css.outerContainer}>
              <View className={css.imageContainer}>
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
            </View>
          </View>
        )}
      </Modal.Content>

      <Modal.Footer>
        <Button
          text="Close"
          icon="Close"
          onClick={handleClose}
          disabled={stores.faceRecog.isDisabled}
          color={colors.red["900"]}
        />

        <Button
          text={hasDetectedFaces ? "Redetect" : "Detect"}
          icon="Search"
          onClick={handleDetect}
          disabled={stores.faceRecog.isDisabled}
          color={hasDetectedFaces ? colors.blueGrey["700"] : undefined}
        />

        {hasDetectedFaces && (
          <Button
            text="Save"
            icon="Save"
            onClick={handleSave}
            disabled={stores.faceRecog.isDisabled}
          />
        )}
      </Modal.Footer>
    </Modal.Container>
  );
});

const useClasses = makeClasses({
  faceCard: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    borderRadius: "0.3rem",
    marginBottom: "0.4rem",
    padding: "0.4rem",
    backgroundColor: colors.grey["900"],
    "& > img": {
      borderRadius: "0.3rem",
      objectFit: "contain",
      width: "100%",
      maxWidth: "9rem",
      maxHeight: "16rem",
    },
  },
  facesColumn: {
    display: "flex",
    flexDirection: "column",
    marginRight: "0.4rem",
    width: "15rem",
    overflowY: "auto",
  },
  image: {
    maxHeight: "100%",
    height: "fit-content",
    width: "100%",
    objectFit: "contain",
  },
  imageContainer: {
    display: "flex",
    alignItems: "center",
  },
  outerContainer: {
    display: "flex",
    flex: 1,
    justifyContent: "center",
    borderRadius: "0.3rem",
    width: "100%",
    height: "100%",
    background: `linear-gradient(to top left, ${colors.grey["900"]}, ${Color(colors.grey["900"])
      .lighten(0.15)
      .string()})`,
    overflow: "hidden",
  },
  rootContainer: {
    display: "flex",
    flex: 1,
    flexDirection: "row",
    maxHeight: "-webkit-fill-available",
  },
});
