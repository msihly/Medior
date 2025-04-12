import { getCurrentWindow, screen } from "@electron/remote";
import { useContext, useEffect, useRef, useState } from "react";
import { getRatingMeta, Icon, IconButton, TagRow, Text, View } from "medior/components";
import { observer, useStores } from "medior/store";
import { colors, makeClasses, zoomScaleStepIn, zoomScaleStepOut } from "medior/utils/client";
import { round } from "medior/utils/common";
import { ZoomContext } from "medior/views";

export const CarouselTopBar = observer(() => {
  const stores = useStores();

  const file = stores.file.getById(stores.carousel.activeFileId);
  const ratingMeta = getRatingMeta(file?.rating);

  const [isAspectRatioLocked, setIsAspectRatioLocked] = useState(true);

  const { css } = useClasses({
    isMouseMoving: stores.carousel.isMouseMoving,
    isPinned: stores.carousel.isPinned,
    ratingTextShadow: ratingMeta?.textShadow,
  });

  const panZoomRef = useContext(ZoomContext);

  const fitToAspectRatio = () => {
    try {
      const primaryDisplay = screen.getPrimaryDisplay();
      const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

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

  const didAspectInit = useRef(false);
  useEffect(() => {
    if (!didAspectInit.current && file?.width > 0 && file?.height > 0) {
      fitToAspectRatio();
      didAspectInit.current = true;
    }
  }, [file]);

  const handleEditTags = () => stores.tag.setIsFileTagEditorOpen(true);

  const handleExtractFrame = () => stores.carousel.extractFrame();

  const toggleAspectRatioLock = () => {
    const isLocked = !isAspectRatioLocked;
    setIsAspectRatioLocked(isLocked);
    if (isLocked) fitToAspectRatio();
    else getCurrentWindow().setAspectRatio(0);
  };

  const toggleIsPinned = () => stores.carousel.toggleIsPinned();

  const zoomIn = () => panZoomRef.current.zoom(zoomScaleStepIn(panZoomRef.current.getScale()));

  const zoomOut = () => panZoomRef.current.zoom(zoomScaleStepOut(panZoomRef.current.getScale()));

  const zoomReset = () => {
    panZoomRef.current.reset();
    panZoomRef.current.resetStyle();
  };

  return (
    <View row spacing="0.5rem" className={css.root}>
      <View row flex={1}>
        <IconButton
          name="PushPin"
          iconProps={{ rotation: stores.carousel.isPinned ? 45 : 0 }}
          onClick={toggleIsPinned}
          tooltip={stores.carousel.isPinned ? "Unpin" : "Pin"}
        />

        <IconButton
          name={isAspectRatioLocked ? "Lock" : "LockOpen"}
          onClick={toggleAspectRatioLock}
          tooltip={`${isAspectRatioLocked ? "Unlock" : "Lock"} Aspect Ratio`}
        />

        <IconButton name="Label" onClick={handleEditTags} tooltip="Edit Tags" />

        <View row align="center" spacing="0.3rem">
          {file?.isCorrupted && (
            <Icon name="WarningRounded" size="1em" color={colors.custom.orange} />
          )}

          <Icon name={ratingMeta?.icon} color={ratingMeta?.iconColor} size="inherit" />

          <Text fontSize="1.2em" className={css.rating}>
            {file?.rating}
          </Text>
        </View>
      </View>

      <View row flex={3} overflow="hidden">
        <View margins={{ all: "0 auto" }}>
          <TagRow tagIds={file?.tagIds} />
        </View>
      </View>

      <View row flex={1} justify="flex-end">
        {file?.isVideo ? (
          <IconButton name="Camera" onClick={handleExtractFrame} tooltip="Extract Frame" />
        ) : (
          <>
            <IconButton name="Replay" onClick={zoomReset} tooltip="Reset Zoom" />

            <IconButton name="ZoomOut" onClick={zoomOut} tooltip="Zoom Out" />

            <IconButton name="ZoomIn" onClick={zoomIn} tooltip="Zoom In" />
          </>
        )}
      </View>
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
    lineHeight: 1,
    textShadow: props.ratingTextShadow,
  },
  root: {
    position: props.isPinned ? undefined : "absolute",
    top: 0,
    left: 0,
    right: 0,
    display: "flex",
    flexFlow: "row nowrap",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0.2rem 0.5rem",
    height: "2.5rem",
    backgroundColor: "black",
    opacity: props.isPinned ? 1 : props.isMouseMoving ? 0.3 : 0,
    zIndex: 10,
    transition: "all 200ms ease-in-out",
    "&:hover": { opacity: 1 },
  },
}));
