import { MutableRefObject, useContext, useEffect, useRef } from "react";
import { OnProgressProps } from "react-player/base";
import ReactPlayer from "react-player/file";
import { CircularProgress } from "@mui/material";
import Panzoom, { PanzoomOptions } from "@panzoom/panzoom";
import {
  Comp,
  FileBase,
  LoadingOverlay,
  Splicer,
  Text,
  VideoControls,
  View,
} from "medior/components";
import { useStores } from "medior/store";
import { colors, makeClasses } from "medior/utils/client";
import { CONSTANTS, round } from "medior/utils/common";
import { VideoContext, ZoomContext } from "medior/views";

export const Carousel = Comp((_, videoRef: MutableRefObject<ReactPlayer>) => {
  const stores = useStores();
  const activeFile = stores.carousel.getActiveFile();
  const activeTranscript = stores.carousel.isCaptionsVisible
    ? activeFile?.transcription?.segments?.find(
        ({ end, start }) => stores.carousel.curTime >= start && stores.carousel.curTime <= end,
      )?.text
    : null;

  const { css } = useClasses({
    isPinned: stores.carousel.isPinned,
    isWaveformVisible:
      stores.carousel.isWaveformVisible && Boolean(activeFile?.waveformPeaks?.length),
  });

  const panZoomRef = useContext(ZoomContext);

  const zoomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panZoomRef.current =
      activeFile?.isVideo || zoomRef.current === null
        ? null
        : Panzoom(zoomRef.current, {
            animate: true,
            contain: "outside",
            cursor: "grab",
            maxScale: CONSTANTS.CAROUSEL.ZOOM.MAX_SCALE,
            minScale: CONSTANTS.CAROUSEL.ZOOM.MIN_SCALE,
            panOnlyWhenZoomed: true,
            startScale: 1,
            startX: 0,
            startY: 0,
            step: CONSTANTS.CAROUSEL.ZOOM.STEP,
          } as PanzoomOptions);
  }, [stores.carousel.activeFileId, stores.carousel.isPinned]);

  useEffect(() => {
    if (activeFile?.isVideo) stores.carousel.setIsPlaying(true);
  }, [activeFile?.isVideo]);

  useEffect(() => {
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
    const frame = round(stores.carousel.seekOffset + args.playedSeconds * activeFile?.frameRate, 0);
    if (stores.carousel.videoMarks.length === 2 && frame >= stores.carousel.markOut) {
      videoRef.current.seekTo(stores.carousel.markIn / activeFile.totalFrames, "fraction");
    } else stores.carousel.setCurFrame(frame, activeFile.frameRate);
  };

  const togglePlaying = () => stores.carousel.setIsPlaying(!stores.carousel.isPlaying);

  return (
    <VideoContext.Provider value={videoRef}>
      <View column flex={1} overflow="hidden">
        <View
          flex={1}
          height={
            stores.carousel.isPinned
              ? `calc(100% - ${CONSTANTS.CAROUSEL.VIDEO.CONTROLS_HEIGHT}px)`
              : "100%"
          }
        >
          {!activeFile ? (
            <LoadingOverlay isLoading />
          ) : (
            <View row width="100%" height="100%">
              <View ref={zoomRef} column height="100%" width="100%" justify="center">
                <FileBase.ContextMenu
                  file={activeFile}
                  store={stores.file.search}
                  carouselFileIds={stores.carousel.selectedFileIds}
                  className={css.contextMenu}
                >
                  {activeFile.isVideo ? (
                    <View
                      column
                      flex={1}
                      height="inherit"
                      onClick={togglePlaying}
                      className={css.videoSurface}
                    >
                      {stores.carousel.isWaitingForFrames && (
                        <View
                          column
                          align="center"
                          justify="center"
                          spacing="1rem"
                          height="100%"
                          width="100%"
                          onClick={(event) => event.stopPropagation()}
                          className={css.transcodingOverlay}
                        >
                          <CircularProgress color="inherit" />

                          <Text preset="title" fontSize="0.9em">
                            {"Transcoding..."}
                          </Text>
                        </View>
                      )}

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

                      {activeTranscript && (
                        <View className={css.captions}>
                          <Text color={colors.custom.white} fontSize="1.1em" fontWeight={600}>
                            {activeTranscript}
                          </Text>
                        </View>
                      )}
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

              {stores.carousel.splicer.isOpen && <Splicer />}
            </View>
          )}
        </View>

        {activeFile?.isVideo && <VideoControls />}
      </View>
    </VideoContext.Provider>
  );
});

interface ClassesProps {
  isPinned: boolean;
  isWaveformVisible: boolean;
}

const useClasses = makeClasses((props: ClassesProps) => ({
  captions: {
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    bottom:
      (props.isPinned ? 0 : CONSTANTS.CAROUSEL.VIDEO.CONTROLS_HEIGHT) +
      (props.isWaveformVisible ? 48 : 0) +
      8,
    maxWidth: "70%",
    minWidth: "10rem",
    padding: "0.3rem 0.6rem",
    pointerEvents: "none",
    position: "absolute",
    right: "50%",
    textAlign: "center",
    transform: "translateX(50%)",
    width: "fit-content",
    zIndex: 4,
  },
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
  videoSurface: {
    position: "relative",
  },
  transcodingOverlay: {
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 1,
  },
}));
