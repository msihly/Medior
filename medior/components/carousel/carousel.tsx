import remote from "@electron/remote";
import { MutableRefObject, useContext, useEffect, useRef } from "react";
import { OnProgressProps } from "react-player/base";
import ReactPlayer from "react-player/file";
import Panzoom, { PanzoomOptions } from "@panzoom/panzoom";
import {
  Button,
  Comp,
  FileBase,
  LoadingOverlay,
  ProgressCircle,
  Splicer,
  Text,
  VideoControls,
  View,
} from "medior/components";
import { useStores } from "medior/store";
import { colors, makeClasses } from "medior/utils/client";
import { CONSTANTS, Fmt, round } from "medior/utils/common";
import { videoTranscoder } from "medior/utils/server/videos";
import { VideoContext, ZoomContext } from "medior/views";

export const Carousel = Comp((_, videoRef: MutableRefObject<ReactPlayer>) => {
  const stores = useStores();
  const store = stores.carousel;

  const activeFile = store.getActiveFile();

  const playbackUrl = store.requiresTranscoding ? store.mediaSourceUrl : activeFile?.path;

  const activeTranscript = store.isCaptionsVisible
    ? activeFile?.transcription?.segments?.find(
        ({ end, start }) => store.curTime >= start && store.curTime <= end,
      )?.text
    : null;

  const { css } = useClasses({
    isPinned: store.isPinned,
    isWaveformVisible: store.isWaveformVisible && Boolean(activeFile?.waveformPeaks?.length),
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

    return () => {
      panZoomRef.current?.destroy();
      panZoomRef.current = null;
    };
  }, [activeFile?.path, store.activeFileId, store.isPinned]);

  useEffect(() => {
    if (activeFile?.isVideo) store.setIsPlaying(true);
  }, [activeFile?.isVideo]);

  useEffect(() => {
    store.setSeekOffset(0);

    if (activeFile?.isVideo) store.setCurFrame(0, activeFile.frameRate);

    store.transcodeVideo();

    return () => videoTranscoder.dispose();
  }, [activeFile?.path]);

  useEffect(() => {
    if (store.mediaSourceUrl)
      videoTranscoder.setMediaElementGetter(
        store.mediaSourceUrl,
        () => (videoRef.current?.getInternalPlayer() as HTMLMediaElement | undefined) ?? null,
      );
  }, [playbackUrl]);

  const isCurrentPlayback = () =>
    activeFile?.id === store.activeFileId &&
    playbackUrl ===
      (store.requiresTranscoding ? store.mediaSourceUrl : store.getActiveFile()?.path);

  const handleVideoError = (error: Error | Event) => {
    if (!isCurrentPlayback()) return;

    const playbackError =
      "target" in error
        ? new Error(
            (error.target as HTMLMediaElement)?.error?.message ||
              "The browser could not play the transcoded video.",
          )
        : error;

    if (playbackError.name === "AbortError") return;

    if (!store.requiresTranscoding) {
      store.transcodeVideo({ force: true, seekTime: store.curTime });
    } else {
      console.error("[Transcode] Browser playback failed:", playbackError);
      videoTranscoder.dispose();
      store.handleTranscodeError(playbackError);
    }
  };

  const handleVideoReady = () => {
    if (!isCurrentPlayback()) return;

    store.setIsWaitingForFrames(false);

    if (store.mediaSourceUrl) videoTranscoder.markReady(store.mediaSourceUrl);
  };

  const handleVideoEnd = () => {
    if (!isCurrentPlayback()) return;

    store.setCurFrame(1, activeFile.frameRate);

    if (store.requiresTranscoding) {
      store.transcodeVideo();
      store.setIsPlaying(true);
    } else videoRef.current?.seekTo(0);
  };

  const handleVideoProgress = (args: OnProgressProps) => {
    if (!isCurrentPlayback()) return;

    videoTranscoder.setCurrentTime(args.playedSeconds);

    const frame = round(store.seekOffset + args.playedSeconds * activeFile?.frameRate, 0);

    if (store.videoMarks.length === 2 && frame >= store.markOut) {
      if (store.requiresTranscoding) {
        if (store.isWaitingForFrames) return;

        store.transcodeVideo({
          seekTime: Fmt.frameToSec(store.markIn, activeFile.frameRate),
        });
      } else videoRef.current.seekTo(store.markIn / activeFile.totalFrames, "fraction");
    } else store.setCurFrame(frame, activeFile.frameRate);
  };

  const togglePlaying = () => store.setIsPlaying(!store.isPlaying);

  const handleCancelLoad = () => {
    stores.file.search.cancelLoad();

    if (stores.collection.manager.isTriagerOpen) {
      stores.collection.editor.cancelLoad();
      stores.collection.manager.setIsTriagerOpen(false);
    } else remote.getCurrentWindow().close();
  };

  return (
    <VideoContext.Provider value={videoRef}>
      <View column flex={1} overflow="hidden" position="relative">
        <LoadingOverlay
          isLoading={store.isEditingImage || store.isExtractingFrame}
          sub={
            store.isExtractingFrame &&
            !store.isSavingFrame && (
              <Button text="Cancel" icon="Close" onClick={store.cancelFrameExtraction} />
            )
          }
        />

        <View
          flex={1}
          height={
            store.isPinned ? `calc(100% - ${CONSTANTS.CAROUSEL.VIDEO.CONTROLS_HEIGHT}px)` : "100%"
          }
        >
          {!activeFile ? (
            <LoadingOverlay
              isLoading
              sub={<Button text="Cancel" icon="Close" onClick={handleCancelLoad} />}
            />
          ) : (
            <View row width="100%" height="100%">
              <View ref={zoomRef} column height="100%" width="100%" justify="center">
                <FileBase.ContextMenu
                  file={activeFile}
                  store={stores.file.search}
                  carouselFileIds={store.selectedFileIds}
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
                      {store.isWaitingForFrames && (
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
                          <ProgressCircle color="inherit" variant="indeterminate" />

                          <Text preset="title" fontSize="0.9em">
                            {"Transcoding..."}
                          </Text>
                        </View>
                      )}

                      <ReactPlayer
                        key={playbackUrl ?? activeFile.path}
                        ref={videoRef}
                        url={playbackUrl ?? undefined}
                        playing={store.isPlaying}
                        onEnded={handleVideoEnd}
                        onError={handleVideoError}
                        onProgress={handleVideoProgress}
                        onReady={handleVideoReady}
                        progressInterval={100}
                        width="100%"
                        height="100%"
                        muted={store.volume === 0}
                        volume={store.volume}
                        playbackRate={store.playbackRate}
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
                    <View
                      component="img"
                      src={activeFile.path}
                      alt={activeFile.originalName}
                      draggable={false}
                      loading="lazy"
                      className={css.image}
                    />
                  )}
                </FileBase.ContextMenu>
              </View>

              {store.splicer.isOpen && <Splicer />}
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
    objectFit: "scale-down",
    userSelect: "none",
    width: "100%",
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
  videoSurface: {
    position: "relative",
  },
}));
