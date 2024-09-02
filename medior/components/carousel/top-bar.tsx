import { getCurrentWindow, screen } from "@electron/remote";
import { useContext, useEffect, useRef, useState } from "react";
import { observer, useStores } from "medior/store";
import { ZoomContext, Icon, IconButton, SideScroller, TagChip, Text, View } from "medior/components";
import { colors, makeClasses, round, zoomScaleStepIn, zoomScaleStepOut } from "medior/utils";

export const CarouselTopBar = observer(() => {
  const stores = useStores();

  const file = stores.file.getById(stores.carousel.activeFileId);

  const [isAspectRatioLocked, setIsAspectRatioLocked] = useState(true);
  const [isPinned, setIsPinned] = useState(false);

  const { css } = useClasses({ isMouseMoving: stores.carousel.isMouseMoving, isPinned });

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

  const toggleIsPinned = () => setIsPinned(!isPinned);

  const zoomIn = () => panZoomRef.current.zoom(zoomScaleStepIn(panZoomRef.current.getScale()));

  const zoomOut = () => panZoomRef.current.zoom(zoomScaleStepOut(panZoomRef.current.getScale()));

  const zoomReset = () => {
    panZoomRef.current.zoom(1);
    panZoomRef.current.reset();
  };

  return (
    <View className={css.root}>
      <View row flex={1}>
        <IconButton
          name="PushPin"
          iconProps={{ rotation: isPinned ? 45 : 0 }}
          onClick={toggleIsPinned}
          tooltip={`${isPinned ? "Unpin" : "Pin"} Top Bar`}
        />

        <IconButton
          name={isAspectRatioLocked ? "Lock" : "LockOpen"}
          onClick={toggleAspectRatioLock}
          tooltip={`${isAspectRatioLocked ? "Unlock" : "Lock"} Aspect Ratio`}
        />

        <IconButton name="Label" onClick={handleEditTags} tooltip="Edit Tags" />

        <View className={css.ratingContainer}>
          <Icon
            name="Star"
            color={colors.custom.orange}
            size="inherit"
            margins={{ right: "0.1em" }}
          />

          <Text className={css.rating}>{file?.rating}</Text>
        </View>
      </View>

      <View className={css.center}>
        <SideScroller innerClassName={css.tags}>
          {file?.tagIds?.map((tagId) => (
            <TagChip key={tagId} id={tagId} hasEditor />
          ))}
        </SideScroller>
      </View>

      <View row flex={1} justify="flex-end">
        {file?.isPlayableVideo ? (
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
}

const useClasses = makeClasses(({ isMouseMoving, isPinned }: ClassesProps) => ({
  center: {
    display: "flex",
    flex: 3,
    justifyContent: "center",
    padding: "0 0.3rem",
    minWidth: 0,
  },
  rating: {
    color: colors.custom.lightGrey,
    lineHeight: 1,
  },
  ratingContainer: {
    display: "flex",
    flexFlow: "row nowrap",
    justifyContent: "center",
    alignItems: "center",
    fontSize: "1.2em",
  },
  root: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    display: "flex",
    flexFlow: "row nowrap",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0.2rem 0.5rem",
    backgroundColor: "black",
    opacity: isPinned ? 1 : isMouseMoving ? 0.3 : 0,
    zIndex: 10,
    transition: "all 200ms ease-in-out",
    "&:hover": { opacity: 1 },
  },
  tags: {
    justifyContent: "center",
  },
}));
