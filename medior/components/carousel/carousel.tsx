import { shell } from "@electron/remote";
import { createContext, MutableRefObject, useContext, useEffect, useRef } from "react";
import { observer, useStores } from "medior/store";
import ReactPlayer from "react-player/file";
import { OnProgressProps } from "react-player/base";
import Panzoom, { PanzoomObject, PanzoomOptions } from "@panzoom/panzoom";
import { Button, FileBase, LoadingOverlay, Text, VideoControls, View } from "medior/components";
import { CONSTANTS, makeClasses, round } from "medior/utils";

export const ZoomContext = createContext<MutableRefObject<PanzoomObject>>(null);

export const Carousel = observer(() => {
  const panZoomRef = useContext(ZoomContext);

  const stores = useStores();
  const activeFile = stores.file.getById(stores.carousel.activeFileId);

  const videoRef = useRef<ReactPlayer>(null);
  const zoomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panZoomRef.current =
      zoomRef.current !== null
        ? Panzoom(zoomRef.current, {
            animate: true,
            contain: "outside",
            cursor: "grab",
            disablePan: activeFile?.isVideo,
            disableZoom: activeFile?.isVideo,
            maxScale: CONSTANTS.CAROUSEL.ZOOM.MAX_SCALE,
            minScale: CONSTANTS.CAROUSEL.ZOOM.MIN_SCALE,
            panOnlyWhenZoomed: true,
            startScale: 1,
            startX: 0,
            startY: 0,
            step: CONSTANTS.CAROUSEL.ZOOM.STEP,
          } as PanzoomOptions)
        : null;
  }, [stores.carousel.activeFileId, stores.carousel.isPinned]);

  useEffect(() => {
    if (activeFile?.isVideo) stores.carousel.setIsPlaying(true);
  }, [activeFile?.isVideo]);

  const { css } = useClasses(null);

  const handleOpenNatively = () => shell.openPath(activeFile.path);

  const handleVideoProgress = ({ playedSeconds }: OnProgressProps) => {
    stores.carousel.setCurFrame(round(playedSeconds * activeFile?.frameRate, 0));
    stores.carousel.setCurTime(playedSeconds);
  };

  const togglePlaying = () => stores.carousel.setIsPlaying(!stores.carousel.isPlaying);

  return (
    <View column flex={1} overflow="hidden">
      <View flex={1}>
        {!activeFile ? (
          <LoadingOverlay isLoading />
        ) : (
          <View ref={zoomRef} column height="100%" justify="center">
            <FileBase.ContextMenu
              file={activeFile}
              options={{ collections: false, faceRecognition: false }}
              className={css.contextMenu}
            >
              {activeFile.isVideo ? (
                activeFile.isPlayableVideo ? (
                  <View column flex={1} height="inherit" onClick={togglePlaying}>
                    <ReactPlayer
                      ref={videoRef}
                      url={activeFile.path}
                      playing={stores.carousel.isPlaying}
                      onProgress={handleVideoProgress}
                      progressInterval={100}
                      width="100%"
                      height="100%"
                      loop
                      muted={stores.carousel.volume === 0}
                      volume={stores.carousel.volume}
                    />
                  </View>
                ) : (
                  <View column flex={1} justify="center" height="inherit">
                    <FileBase.Image
                      thumbPaths={activeFile.thumbPaths}
                      title={activeFile.originalName}
                      height={CONSTANTS.CAROUSEL.THUMB_NAV.WIDTH * 2}
                      fit="contain"
                      autoAnimate
                      draggable={false}
                      className={css.videoThumbs}
                    />

                    <View row justify="center" align="center" spacing="0.2em">
                      <Text>{`'${activeFile.ext}' not supported.`}</Text>
                      <Button type="link" text="Open Natively." onClick={handleOpenNatively} />
                    </View>
                  </View>
                )
              ) : (
                <img
                  src={activeFile.path}
                  alt={activeFile.originalName}
                  draggable={false}
                  loading="lazy"
                  className={css.image}
                />
              )}
            </FileBase.ContextMenu>
          </View>
        )}
      </View>

      {activeFile?.isPlayableVideo && <VideoControls ref={videoRef} />}
    </View>
  );
});

const useClasses = makeClasses({
  contextMenu: {
    display: "flex",
    height: "100%",
  },
  image: {
    borderRadius: "inherit",
    width: "100%",
    objectFit: "scale-down",
    userSelect: "none",
  },
  videoThumbs: {
    borderRadius: "0.4rem",
    margin: "0 auto 0.5rem",
    height: "auto",
    width: "fit-content",
  },
});
