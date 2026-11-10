import remote from "@electron/remote";
import { MutableRefObject, SyntheticEvent, useContext, useEffect, useRef } from "react";
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
import { colors, makeClasses, seekToFraction, toast } from "medior/utils/client";
import { CONSTANTS, Fmt, round } from "medior/utils/common";
import { videoTranscoder } from "medior/utils/server/videos";
import { VideoContext, ZoomContext } from "medior/views";
import { useVideoPlayback, VideoProgress } from "./hooks";

export const Carousel = Comp((_, videoRef: MutableRefObject<HTMLVideoElement>) => {
  const stores = useStores();
  const store = stores.carousel;

  const activeFile = store.getActiveFile();
  const playbackUrl = store.requiresTranscoding ? store.mediaSourceUrl : activeFile?.path;
  const activeCaption = store.isCaptionsVisible ? store.activeCaption : null;

  const { css } = useClasses({
    isPinned: store.isPinned,
    isWaveformVisible: store.isWaveformShown,
  });

  const panZoomRef = useContext(ZoomContext);

  /** A start time waiting for directly played video to load before seeking to it. */
  const pendingSeekTime = useRef<number>(null);
  const zoomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panZoomRef.current =
      activeFile?.isPlayable || zoomRef.current === null
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
    if (activeFile?.isPlayable) store.setIsPlaying(true);
  }, [activeFile?.isPlayable]);

  useEffect(() => {
    const startTime = store.startTimes[activeFile?.id] ?? 0;

    pendingSeekTime.current = startTime && !store.requiresTranscoding ? startTime : null;
    store.setSeekOffset(0);

    if (activeFile?.isPlayable)
      store.setCurFrame(
        round(startTime * activeFile.playbackFrameRate, 0),
        activeFile.playbackFrameRate,
      );

    store.transcodeVideo({ seekTime: startTime });
    loadChapters();
    loadSubtitleTracks();

    return () => videoTranscoder.dispose();
  }, [activeFile?.path]);

  useEffect(() => {
    if (store.mediaSourceUrl)
      videoTranscoder.setMediaElementGetter(store.mediaSourceUrl, () => videoRef.current);
  }, [playbackUrl]);

  const loadChapters = async () => {
    const res = await store.loadChapters();
    if (!res.success) toast.error(res.error);
  };

  const loadSubtitleTracks = async () => {
    const res = await store.loadSubtitleTracks();
    if (!res.success) toast.error(res.error);
  };

  const isCurrentPlayback = () =>
    activeFile?.id === store.activeFileId &&
    playbackUrl ===
      (store.requiresTranscoding ? store.mediaSourceUrl : store.getActiveFile()?.path);

  const handleVideoError = (error: Error | SyntheticEvent<HTMLVideoElement>) => {
    if (!isCurrentPlayback()) return;

    const playbackError =
      "target" in error
        ? new Error(
            (error.target as HTMLMediaElement)?.error?.message ||
              "The browser could not play the transcoded video.",
          )
        : error;

    if (playbackError.name === "AbortError") return;

    // Only videos can be transcoded, so audio the browser can't play reports its error instead.
    if (activeFile.isVideo && !store.requiresTranscoding) {
      // The transcoded stream starts at the current time, so it needs no seek of its own.
      pendingSeekTime.current = null;
      store.transcodeVideo({ force: true, seekTime: store.curTime });
    } else {
      console.error("[Transcode] Browser playback failed:", playbackError);
      videoTranscoder.dispose();
      store.handleTranscodeError(playbackError);
    }
  };

  const handleVideoReady = (video: HTMLVideoElement) => {
    if (!isCurrentPlayback()) return;

    store.setIsWaitingForFrames(false);

    if (store.mediaSourceUrl) videoTranscoder.markReady(store.mediaSourceUrl);

    if (pendingSeekTime.current !== null) {
      video.currentTime = pendingSeekTime.current;
      pendingSeekTime.current = null;
    }
  };

  const handleVideoEnd = (event: SyntheticEvent<HTMLVideoElement>) => {
    if (!isCurrentPlayback()) return;

    store.recordWatchProgress();
    store.setCurFrame(1, activeFile.playbackFrameRate);

    // Audio plays on into the next file, like an album, while videos and the last track loop.
    const nextFileId = activeFile.isAudio ? store.selectedFileIds[store.activeFileIndex + 1] : null;

    if (nextFileId) {
      store.setActiveFileId(nextFileId);
      stores.file.setActiveFileId(nextFileId);
    } else if (store.requiresTranscoding) {
      store.transcodeVideo();
      store.setIsPlaying(true);
    } else event.currentTarget.currentTime = 0;
  };

  const handleVideoProgress = ({ playedSeconds }: VideoProgress) => {
    if (!isCurrentPlayback()) return;

    videoTranscoder.setCurrentTime(playedSeconds);

    const frame = round(store.seekOffset + playedSeconds * activeFile?.playbackFrameRate, 0);

    if (store.videoMarks.length === 2 && frame >= store.markOut) {
      if (store.requiresTranscoding) {
        if (store.isWaitingForFrames) return;

        store.transcodeVideo({
          seekTime: Fmt.frameToSec(store.markIn, activeFile.frameRate),
        });
      } else seekToFraction(videoRef.current, store.markIn / activeFile.totalFrames);
    } else {
      store.setCurFrame(frame, activeFile.playbackFrameRate);
      store.recordWatchProgress();
    }
  };

  const { handleCanPlay } = useVideoPlayback({
    isPlaying: store.isPlaying,
    onError: handleVideoError,
    onProgress: handleVideoProgress,
    onReady: handleVideoReady,
    playbackRate: store.playbackRate,
    videoRef,
    volume: store.volume,
  });

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
                  {activeFile.isPlayable ? (
                    <View
                      column
                      flex={1}
                      height="inherit"
                      onClick={store.toggleIsPlaying}
                      className={css.videoSurface}
                    >
                      {activeFile.isAudio && (
                        <View column flex={1} justify="center" overflow="hidden">
                          <View
                            component="img"
                            src={activeFile.thumb.path}
                            alt={activeFile.originalName}
                            draggable={false}
                            className={css.image}
                          />
                        </View>
                      )}

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

                      <View
                        component="video"
                        key={playbackUrl ?? activeFile.path}
                        ref={videoRef}
                        src={playbackUrl ?? undefined}
                        preload="auto"
                        muted={store.volume === 0}
                        onCanPlay={handleCanPlay}
                        onEnded={handleVideoEnd}
                        onError={handleVideoError}
                        display={activeFile.isAudio ? "none" : undefined}
                        width="100%"
                        height="100%"
                      />

                      {activeCaption && (
                        <View className={css.captions}>
                          <Text
                            color={colors.custom.white}
                            fontSize="1.1em"
                            fontWeight={600}
                            whiteSpace="pre-line"
                          >
                            {activeCaption}
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

        {activeFile?.isPlayable && <VideoControls />}
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
