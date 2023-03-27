import { getCurrentWindow, screen } from "@electron/remote";
import { useContext, useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { colors, Slider } from "@mui/material";
import {
  CarouselContext,
  Icon,
  IconButton,
  SideScroller,
  Tag,
  Tagger,
  Text,
  View,
} from "components";
import { makeClasses, round } from "utils";

export const CarouselTopBar = observer(() => {
  const { css, cx } = useClasses(null);

  const { fileStore } = useStores();
  const { activeFileId, panZoomRef } = useContext(CarouselContext);
  const file = fileStore.getById(activeFileId);

  const [isAspectRatioLocked, setIsAspectRatioLocked] = useState(true);
  const [isTaggerOpen, setIsTaggerOpen] = useState(false);

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

  const handleEditTags = () => setIsTaggerOpen(true);

  const toggleAspectRatioLock = () => {
    const isLocked = !isAspectRatioLocked;
    setIsAspectRatioLocked(isLocked);
    if (isLocked) fitToAspectRatio();
    else getCurrentWindow().setAspectRatio(0);
  };

  /* ------------------------------ BEGIN - ZOOM ------------------------------ */
  const [zoomScale, setZoomScale] = useState(1);

  useEffect(() => {
    panZoomRef.current?.zoom(zoomScale);
  }, [zoomScale]);

  const handleResetTransform = () => {
    setZoomScale(1);
    panZoomRef.current.reset();
  };

  const zoomIn = () => setZoomScale(Math.min(zoomScale + 1, 10));

  const zoomOut = () => setZoomScale(Math.max(zoomScale - 1, 1));
  /* ------------------------------ END - ZOOM ------------------------------ */

  return (
    <View className={css.root}>
      <View className={css.side}>
        <IconButton
          name={isAspectRatioLocked ? "Lock" : "LockOpen"}
          onClick={toggleAspectRatioLock}
        />

        <IconButton name="Label" onClick={handleEditTags} />

        <View className={css.ratingContainer}>
          <Icon
            name="Star"
            color={colors.amber["600"]}
            size="inherit"
            margins={{ right: "0.1em" }}
          />

          <Text className={css.rating}>{file?.rating}</Text>
        </View>
      </View>

      <View className={css.center}>
        <SideScroller innerClassName={css.tags}>
          {file?.tagIds?.map((tagId) => (
            <Tag key={tagId} id={tagId} />
          ))}
        </SideScroller>
      </View>

      {file?.isVideo ? (
        <View className={css.side} />
      ) : (
        <View className={cx(css.side, css.zoomContainer)}>
          <IconButton name="Replay" onClick={handleResetTransform} />

          <IconButton name="ZoomOut" onClick={zoomOut} margins={{ right: "0.5rem" }} />

          <Slider
            value={zoomScale}
            onChange={(_, val: number) => setZoomScale(val)}
            min={1}
            step={0.1}
            max={10}
            valueLabelDisplay="off"
          />

          <IconButton name="ZoomIn" onClick={zoomIn} margins={{ left: "0.5rem" }} />
        </View>
      )}

      {isTaggerOpen && <Tagger files={[file]} setVisible={setIsTaggerOpen} />}
    </View>
  );
});

const useClasses = makeClasses({
  aspectRatioLock: {
    opacity: 0.7,
  },
  center: {
    display: "flex",
    flex: 3,
    justifyContent: "center",
    padding: "0 0.3rem",
    minWidth: 0,
  },
  rating: {
    color: colors.grey["100"],
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
    opacity: 0.3,
    zIndex: 10,
    transition: "all 200ms ease-in-out",
    "&:hover": {
      opacity: 1,
    },
  },
  side: {
    display: "flex",
    flex: 1,
  },
  tags: {
    justifyContent: "center",
  },
  zoomContainer: {
    display: "flex",
    flexFlow: "row nowrap",
    alignItems: "center",
    width: "18rem",
    minWidth: "12rem",
  },
});
