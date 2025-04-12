import { forwardRef, MutableRefObject, useContext, useEffect, useRef } from "react";
import { OnProgressProps } from "react-player/base";
import ReactPlayer from "react-player/file";
import FilePlayer from "react-player/file";
import Panzoom, { PanzoomOptions } from "@panzoom/panzoom";
import { FileBase, LoadingOverlay, VideoControls, View } from "medior/components";
import { observer, useStores } from "medior/store";
import { makeClasses } from "medior/utils/client";
import { CONSTANTS, round } from "medior/utils/common";
import { VideoContext, ZoomContext } from "medior/views";

export const Carousel = observer(
  forwardRef((_, videoRef: MutableRefObject<FilePlayer>) => {
    const { css } = useClasses(null);

    const panZoomRef = useContext(ZoomContext);

    const stores = useStores();
    const activeFile = stores.carousel.getActiveFile();

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
        document.title = `Medior — Carousel — (${stores.carousel.activeFileIndex + 1} / ${stores.carousel.selectedFileIds.length})`;
      stores.carousel.setSeekOffset(0);
      stores.carousel.transcodeVideo();
    }, [activeFile?.path]);

    const handleVideoEnd = () => {
      stores.carousel.setCurFrame(1, activeFile.frameRate);
      if (stores.carousel.seekOffset > 0) {
        stores.carousel.setSeekOffset(0);
        stores.carousel.transcodeVideo({
          onFirstFrames: () => {
            videoRef.current?.seekTo(0);
            stores.carousel.setIsPlaying(true);
          },
        });
      } else videoRef.current?.seekTo(0);
    };

    const handleVideoProgress = (args: OnProgressProps) => {
      const frame = round(
        stores.carousel.seekOffset + args.playedSeconds * activeFile?.frameRate,
        0
      );
      if (stores.carousel.videoMarks.length === 2 && frame >= stores.carousel.markOut) {
        videoRef.current.seekTo(stores.carousel.markIn / activeFile.totalFrames, "fraction");
      } else stores.carousel.setCurFrame(frame, activeFile.frameRate);
    };

    const togglePlaying = () => stores.carousel.setIsPlaying(!stores.carousel.isPlaying);

    return (
      <VideoContext.Provider value={videoRef}>
        <View column flex={1} overflow="hidden">
          <View flex={1}>
            {!activeFile ? (
              <LoadingOverlay isLoading />
            ) : (
              <View ref={zoomRef} column height="100%" justify="center">
                <FileBase.ContextMenu file={activeFile} className={css.contextMenu}>
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
                        playbackRate={stores.carousel.playbackRate}
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

          {activeFile?.isVideo && <VideoControls />}
        </View>
      </VideoContext.Provider>
    );
  })
);

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
