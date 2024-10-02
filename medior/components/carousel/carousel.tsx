import { createContext, MutableRefObject, useContext, useEffect, useRef } from "react";
import { observer, useStores } from "medior/store";
import ReactPlayer from "react-player/file";
import { OnProgressProps } from "react-player/base";
import Panzoom, { PanzoomObject, PanzoomOptions } from "@panzoom/panzoom";
import { FileBase, LoadingOverlay, VideoControls, View } from "medior/components";
import { CONSTANTS, makeClasses, round } from "medior/utils";

export const ZoomContext = createContext<MutableRefObject<PanzoomObject>>(null);

export const Carousel = observer(() => {
  const { css } = useClasses(null);

  const panZoomRef = useContext(ZoomContext);

  const stores = useStores();
  const activeFile = stores.carousel.getActiveFile();

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

  useEffect(() => {
    if (stores.carousel.selectedFileIds.length)
      document.title = `Medior — Carousel — (${(stores.carousel.activeFileIndex + 1).toString().padStart(4, "0")} / ${stores.carousel.selectedFileIds.length.toString().padStart(4, "0")})`;
    stores.carousel.setSeekOffset(0);
    stores.carousel.transcodeVideo();
  }, [activeFile?.path]);

  const frameToSec = (frame: number) => round(frame / activeFile?.frameRate || 1, 3);

  const handleVideoEnd = () => {
    stores.carousel.setCurFrame(1);
    stores.carousel.setCurTime(0);
    if (stores.carousel.seekOffset > 0) {
      stores.carousel.setSeekOffset(0);
      stores.carousel.transcodeVideo({
        onFirstFrames: () => {
          videoRef.current?.seekTo(0);
          stores.carousel.setIsPlaying(true);
        },
      });
    }
  };

  const handleVideoProgress = (args: OnProgressProps) => {
    const frame = round(stores.carousel.seekOffset + args.playedSeconds * activeFile?.frameRate, 0);
    stores.carousel.setCurFrame(frame);
    stores.carousel.setCurTime(frameToSec(frame));
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
                <View column flex={1} height="inherit" onClick={togglePlaying}>
                  <LoadingOverlay
                    isLoading={stores.carousel.isWaitingForFrames}
                    sub="Transcoding..."
                  />

                  <ReactPlayer
                    ref={videoRef}
                    url={stores.carousel.mediaSourceUrl ?? activeFile.path}
                    playing={stores.carousel.isPlaying}
                    onEnded={handleVideoEnd}
                    onProgress={handleVideoProgress}
                    progressInterval={100}
                    width="100%"
                    height="100%"
                    muted={stores.carousel.volume === 0}
                    volume={stores.carousel.volume}
                  />
                </View>
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

      {activeFile?.isVideo && <VideoControls ref={videoRef} />}
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
});
