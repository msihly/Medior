import { getCurrentWindow, screen } from "@electron/remote";
import { useContext, useEffect, useRef, useState } from "react";
import {
  Comp,
  getRatingMeta,
  Icon,
  IconButton,
  ImageCrop,
  TagRow,
  Text,
  View,
  ZoomControls,
} from "medior/components";
import { useStores } from "medior/store";
import { colors, makeClasses, toast } from "medior/utils/client";
import { CONSTANTS, round } from "medior/utils/common";
import { getIsAnimated, getIsImage } from "medior/utils/server";
import { ZoomContext } from "medior/views";

export const CarouselTopBar = Comp(() => {
  const stores = useStores();
  const store = stores.carousel;

  const file = stores.file.getById(store.activeFileId);
  const canEditImage = file && getIsImage(file.ext) && !getIsAnimated(file.ext);
  const ratingMeta = getRatingMeta(file?.rating);

  const [cropTarget, setCropTarget] = useState<{ expectedHash: string; fileId: string }>(null);
  const [isAspectRatioLocked, setIsAspectRatioLocked] = useState(false);

  const { css } = useClasses({
    isMouseMoving: store.isMouseMoving,
    isPinned: store.isPinned,
    ratingTextShadow: ratingMeta?.textShadow,
  });

  const panZoomRef = useContext(ZoomContext);

  const didAspectInit = useRef(false);

  const fitToAspectRatio = () => {
    try {
      const primaryDisplay = screen.getPrimaryDisplay();
      const { height: screenHeight, width: screenWidth } = primaryDisplay.workAreaSize;

      let winWidth = Math.min(file?.width, screenWidth);
      let winHeight =
        winWidth === screenWidth
          ? (screenWidth / file?.width) * file?.height
          : Math.min(file?.height, screenHeight);

      if (winHeight === screenHeight) winWidth = (screenHeight / file?.height) * file?.width;

      const win = getCurrentWindow();

      win.setContentSize(round(winWidth, 0), round(winHeight, 0), true);

      setTimeout(() => {
        const [width, height] = win.getSize();

        win.setAspectRatio(width / height);
      }, 0);
    } catch (err) {
      console.error("Error fitting to aspect ratio:", err);
      setIsAspectRatioLocked(false);
    }
  };

  useEffect(() => {
    if (!didAspectInit.current && file?.width > 0 && file?.height > 0) {
      fitToAspectRatio();
      didAspectInit.current = true;
    }
  }, [file]);

  const handleEditTags = () => stores.file.tagsEditor.setIsOpen(true);

  const handleOpenCrop = () => setCropTarget({ expectedHash: file.hash, fileId: file.id });

  const handleCloseCrop = () => setCropTarget(null);

  const rotate = async (rotation: -90 | 90) => {
    const result = await store.editImage({ expectedHash: file.hash, fileId: file.id, rotation });

    if (result.success) toast.success("Image rotated");
    else toast.error(result.error);
  };

  const handleRotateLeft = () => rotate(-90);

  const handleRotateRight = () => rotate(90);

  const toggleAspectRatioLock = () => {
    const isLocked = !isAspectRatioLocked;

    setIsAspectRatioLocked(isLocked);

    if (isLocked) fitToAspectRatio();
    else getCurrentWindow().setAspectRatio(0);
  };

  return (
    <View row spacing="0.5rem" className={css.root}>
      <View row flex={1}>
        <IconButton
          name="PushPin"
          iconProps={{ rotation: store.isPinned ? 45 : 0 }}
          onClick={store.toggleIsPinned}
          tooltip={store.isPinned ? "Unpin" : "Pin"}
        />

        <IconButton
          name={isAspectRatioLocked ? "Lock" : "LockOpen"}
          onClick={toggleAspectRatioLock}
          tooltip={`${isAspectRatioLocked ? "Unlock" : "Lock"} Aspect Ratio`}
        />

        <IconButton name="Label" onClick={handleEditTags} tooltip="Edit Tags" />

        <View row align="center" spacing="0.3rem">
          {file?.isCorrupted && <Icon name="Warning" size="1em" color={colors.custom.orange} />}

          <Icon name={ratingMeta?.icon} color={ratingMeta?.iconColor} size="inherit" />

          <Text fontSize="1.2em" className={css.rating}>
            {file?.rating}
          </Text>
        </View>
      </View>

      <View row flex={3} overflow="hidden">
        <View margins={{ all: "0 auto" }}>
          <TagRow tags={file?.tags} />
        </View>
      </View>

      <View row flex={1} justify="flex-end">
        {file?.isVideo ? (
          <>
            <IconButton name="Camera" onClick={store.extractFrame} tooltip="Extract Frame" />

            <IconButton
              name="Cut"
              onClick={store.splicer.toggleIsOpen}
              tooltip={store.splicer.isOpen ? "Close Splicer" : "Open Splicer"}
            />
          </>
        ) : (
          <>
            {canEditImage && (
              <>
                <IconButton
                  name="Crop"
                  onClick={handleOpenCrop}
                  tooltip="Crop Image"
                  disabled={store.isEditingImage}
                />

                <IconButton
                  name="RotateLeft"
                  onClick={handleRotateLeft}
                  tooltip="Rotate Left and Save"
                  disabled={store.isEditingImage}
                />

                <IconButton
                  name="RotateRight"
                  onClick={handleRotateRight}
                  tooltip="Rotate Right and Save"
                  disabled={store.isEditingImage}
                />
              </>
            )}

            <ZoomControls panZoomRef={panZoomRef} />
          </>
        )}
      </View>

      {cropTarget && <ImageCrop {...cropTarget} onClose={handleCloseCrop} />}
    </View>
  );
});

interface ClassesProps {
  isMouseMoving: boolean;
  isPinned: boolean;
  ratingTextShadow: string;
}

const useClasses = makeClasses((props: ClassesProps) => ({
  rating: {
    color: colors.custom.lightGrey,
    textShadow: props.ratingTextShadow,
  },
  root: {
    "&:hover": { opacity: 1 },
    alignItems: "center",
    backgroundColor: CONSTANTS.CAROUSEL.TOP_BAR.BACKGROUND,
    display: "flex",
    flexFlow: "row nowrap",
    height: "2.5rem",
    justifyContent: "space-between",
    left: 0,
    opacity: props.isPinned ? 1 : props.isMouseMoving ? 0.3 : 0,
    padding: "0.2rem 0.5rem",
    position: props.isPinned ? undefined : "absolute",
    right: 0,
    top: 0,
    transition: "all 200ms ease-in-out",
    zIndex: 10,
  },
}));
