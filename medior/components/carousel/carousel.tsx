import { shell } from "@electron/remote";
import { createContext, MutableRefObject, useContext, useEffect, useRef, useState } from "react";
import { observer, useStores } from "medior/store";
import ReactPlayer from "react-player/file";
import { OnProgressProps } from "react-player/base";
import Panzoom, { PanzoomObject, PanzoomOptions } from "@panzoom/panzoom";
import { Slider } from "@mui/material";
import { Button, FileBase, IconButton, Text, THUMB_WIDTH, View } from "medior/components";
import { colors, CONSTANTS, dayjs, makeClasses, round } from "medior/utils";

export const ZoomContext = createContext<MutableRefObject<PanzoomObject>>(null);

export const Carousel = observer(() => {
  const panZoomRef = useContext(ZoomContext);

  const stores = useStores();
  const activeFile = stores.file.getById(stores.carousel.activeFileId);

  const videoRef = useRef<ReactPlayer>(null);
  const zoomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeFile?.isVideo) stores.carousel.setIsPlaying(true);

    panZoomRef.current =
      zoomRef.current !== null
        ? Panzoom(zoomRef.current, {
            animate: true,
            contain: "outside",
            cursor: "grab",
            disablePan: activeFile?.isVideo,
            disableZoom: activeFile?.isVideo,
            maxScale: CONSTANTS.ZOOM.MAX_SCALE,
            minScale: CONSTANTS.ZOOM.MIN_SCALE,
            panOnlyWhenZoomed: true,
            startScale: 1,
            step: CONSTANTS.ZOOM.STEP,
          } as PanzoomOptions)
        : null;
  }, [activeFile?.isVideo, stores.carousel.activeFileId]);

  const [curTime, setCurTime] = useState(0);
  const [lastPlayingState, setLastPlayingState] = useState(false);
  const [isVolumeVisible, setIsVolumeVisible] = useState(false);
  const [lastVolume, setLastVolume] = useState(0.5);
  const [volume, setVolume] = useState(0);

  const { css } = useClasses({ isMouseMoving: stores.carousel.isMouseMoving, isVolumeVisible });

  const handleFrameChange = (frame: number) => {
    stores.carousel.setCurFrame(frame);
    const time = round(frame / activeFile?.frameRate || 1, 3);
    setCurTime(time);
    videoRef.current?.seekTo(time, "seconds");
  };

  const handleFrameSeek = (event: any) => {
    if (stores.carousel.isPlaying) {
      setLastPlayingState(true);
      stores.carousel.setIsPlaying(false);
    }
    handleFrameChange(event.target.value);
  };

  const handleFrameSeekCommit = () => {
    if (lastPlayingState) {
      stores.carousel.setIsPlaying(true);
      setLastPlayingState(false);
    }
  };

  const handleOpenNatively = () => shell.openPath(activeFile.path);

  const handleVideoProgress = ({ playedSeconds }: OnProgressProps) => {
    stores.carousel.setCurFrame(round(playedSeconds * activeFile?.frameRate, 0));
    setCurTime(playedSeconds);
  };

  const handleVolumeChange = (_, vol: number) => {
    setVolume(vol);
    setLastVolume(vol);
  };

  const handleVolumeEnter = () => setIsVolumeVisible(true);

  const handleVolumeLeave = () => setIsVolumeVisible(false);

  const toggleMute = () => {
    if (volume === 0) setVolume(lastVolume);
    else {
      setLastVolume(lastVolume);
      setVolume(0);
    }
  };

  const togglePlaying = () => stores.carousel.setIsPlaying(!stores.carousel.isPlaying);

  return (
    <>
      <View ref={zoomRef} className={css.viewContainer}>
        {!activeFile ? (
          <Text align="center">{"Loading..."}</Text>
        ) : (
          <FileBase.ContextMenu
            file={activeFile}
            options={{ collections: false, faceRecognition: false }}
            className={css.contextMenu}
          >
            {activeFile.isVideo ? (
              activeFile.isPlayableVideo ? (
                <View onClick={togglePlaying} className={css.videoContainer}>
                  <ReactPlayer
                    ref={videoRef}
                    url={activeFile.path}
                    playing={stores.carousel.isPlaying}
                    onProgress={handleVideoProgress}
                    progressInterval={100}
                    width="100%"
                    height="100%"
                    loop
                    muted={volume === 0}
                    volume={volume}
                  />
                </View>
              ) : (
                <View column flex={1} justify="center">
                  <FileBase.Image
                    thumbPaths={activeFile.thumbPaths}
                    title={activeFile.originalName}
                    height={THUMB_WIDTH * 2}
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
        )}
      </View>

      {activeFile?.isPlayableVideo && (
        <View className={css.videoControlBar}>
          <IconButton
            name={stores.carousel.isPlaying ? "Pause" : "PlayArrow"}
            onClick={togglePlaying}
          />

          <View className={css.videoProgressBar}>
            <Slider
              value={stores.carousel.curFrame}
              onChange={handleFrameSeek}
              onChangeCommitted={handleFrameSeekCommit}
              min={1}
              max={activeFile?.totalFrames}
              step={1}
              valueLabelDisplay="auto"
            />
          </View>

          <View onMouseLeave={handleVolumeLeave}>
            <View onMouseEnter={handleVolumeEnter}>
              <IconButton
                name={
                  volume > 0.65
                    ? "VolumeUp"
                    : volume > 0.3
                      ? "VolumeDown"
                      : volume > 0
                        ? "VolumeMute"
                        : "VolumeOff"
                }
                onClick={toggleMute}
              />
            </View>

            <View className={css.volumeSlider}>
              <Slider
                value={volume}
                onChange={handleVolumeChange}
                min={0}
                max={1}
                step={0.01}
                orientation="vertical"
                valueLabelDisplay="off"
              />
            </View>
          </View>

          <View className={css.videoTimeContainer}>
            <Text color={colors.grey["200"]} className={css.videoTime}>
              {dayjs.duration(Math.round(curTime * 1000)).format("HH:mm:ss")}
            </Text>

            <Text color={colors.grey["400"]} className={css.videoTime}>
              {dayjs.duration(Math.round(activeFile?.duration * 1000)).format("HH:mm:ss")}
            </Text>
          </View>
        </View>
      )}
    </>
  );
});

interface ClassesProps {
  isMouseMoving: boolean;
  isVolumeVisible: boolean;
}

const useClasses = makeClasses((_, { isMouseMoving, isVolumeVisible }: ClassesProps) => ({
  contextMenu: {
    display: "contents",
  },
  image: {
    borderRadius: "inherit",
    width: "100%",
    objectFit: "scale-down",
    userSelect: "none",
  },
  videoControlBar: {
    position: "absolute",
    bottom: "3rem",
    left: 0,
    right: 0,
    display: "flex",
    flexFlow: "row nowrap",
    justifyContent: "space-between",
    alignItems: "center",
    borderRadius: "2rem",
    margin: "0 auto",
    padding: "0.2rem 0.5rem",
    width: "80%",
    backgroundColor: "rgb(0, 0, 0, 0.5)",
    cursor: "default",
    zIndex: 5,
    opacity: isMouseMoving ? 0.3 : 0,
    "&:hover": { opacity: 1 },
  },
  videoContainer: {
    display: "flex",
    flex: 1,
  },
  videoProgressBar: {
    display: "flex",
    flex: 1,
    padding: "0 0.7rem",
  },
  videoTimeContainer: {
    display: "flex",
    flexDirection: "column",
    paddingRight: "0.5rem",
  },
  videoTime: {
    fontSize: "0.8em",
    lineHeight: 1,
  },
  viewContainer: {
    display: "flex",
    flex: 1,
    minHeight: 0,
  },
  volumeSlider: {
    display: isVolumeVisible ? "block" : "none",
    position: "absolute",
    bottom: "2.5rem",
    padding: "0.8rem 0.3rem 0.4rem",
    height: "8rem",
    backgroundColor: "rgb(0, 0, 0, 0.5)",
    borderRadius: "1rem 1rem 0 0",
  },
  videoThumbs: {
    borderRadius: "0.4rem",
    margin: "0 auto 0.5rem",
    height: "auto",
    width: "fit-content",
  },
}));
