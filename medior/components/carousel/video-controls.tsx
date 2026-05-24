import { useContext, useState } from "react";
import { Slider } from "@mui/material";
import { Button, Comp, IconButton, Text, View } from "medior/components";
import { useStores } from "medior/store";
import { colors, makeClasses, toast, Toaster } from "medior/utils/client";
import { CONSTANTS, Fmt, round, throttle } from "medior/utils/common";
import { VideoContext } from "medior/views";

export const VideoControls = Comp(() => {
  const stores = useStores();
  const activeFile = stores.carousel.getActiveFile();

  const videoContext = useContext(VideoContext);

  const [lastPlayingState, setLastPlayingState] = useState(false);

  const { css } = useClasses(null);

  const toaster = new Toaster();

  const goToFrame = (frame: number) => {
    stores.carousel.setIsPlaying(false);
    setCurFrame(frame);
    seekVideoPlayer(frame);
    toaster.toast(`Frame: ${Fmt.commas(frame)}`);
  };

  const goToNextFrame = () =>
    goToFrame(Math.min(stores.carousel.curFrame + 1, activeFile?.totalFrames));

  const goToPrevFrame = () => goToFrame(Math.max(stores.carousel.curFrame - 1, 1));

  const handleFrameSeek = (event: any) => {
    if (stores.carousel.isPlaying) {
      setLastPlayingState(true);
      stores.carousel.setIsPlaying(false);
    }

    const frame = event.target.value;
    setCurFrame(frame);

    if (!activeFile?.isWebPlayable) transcode(frame);
    else seekVideoPlayer(frame);
  };

  const handleFrameSeekCommit = () => {
    if (lastPlayingState) {
      stores.carousel.setIsPlaying(true);
      setLastPlayingState(false);
    }
  };

  const getNewMark = (frame: number) =>
    stores.carousel.videoMarks.map((m) => m.value).includes(frame) ? null : frame;

  const handleMarkInChange = () => {
    const newMarkIn = getNewMark(stores.carousel.curFrame);
    if (![newMarkIn, stores.carousel.markOut].includes(null) && newMarkIn > stores.carousel.markOut)
      return toast.error("Mark In (A) must be before Mark Out (B)");

    stores.carousel.setMarkIn(newMarkIn);
    toaster.toast(
      newMarkIn === null ? "Mark In (A) Cleared" : `Mark In (A): ${Fmt.commas(newMarkIn)}`,
    );
  };

  const handleMarkOutChange = () => {
    const newMarkOut = getNewMark(stores.carousel.curFrame);
    if (![stores.carousel.markIn, newMarkOut].includes(null) && newMarkOut < stores.carousel.markIn)
      return toast.error("Mark Out (B) must be after Mark In (A)");

    stores.carousel.setMarkOut(newMarkOut);
    toaster.toast(
      newMarkOut === null ? "Mark Out (B) Cleared" : `Mark Out (B): ${Fmt.commas(newMarkOut)}`,
    );
  };

  const handlePlaybackRateChange = (_, rate: number) => stores.carousel.setPlaybackRate(rate);

  const handleVolumeChange = (_, vol: number) => {
    stores.carousel.setVolume(vol);
    stores.carousel.setLastVolume(vol);
  };

  const resetPlaybackRate = () => stores.carousel.setPlaybackRate(1);

  const seekVideoPlayer = (frame: number) =>
    videoContext?.current?.seekTo(frame / activeFile.totalFrames, "fraction");

  const setCurFrame = (frame: number) => stores.carousel.setCurFrame(frame, activeFile.frameRate);

  const toggleMute = () => stores.carousel.toggleMute();

  const togglePlaying = () => stores.carousel.toggleIsPlaying();

  const transcode = throttle(async (frame: number) => {
    stores.carousel.setSeekOffset(frame);
    return await stores.carousel.transcodeVideo({
      seekTime: Fmt.frameToSec(frame, activeFile.frameRate),
      onFirstFrames: () => setCurFrame(frame),
    });
  }, 200);

  return (
    <View
      row
      spacing="0.5rem"
      position={stores.carousel.isPinned ? undefined : "absolute"}
      opacity={stores.carousel.isPinned ? 1 : stores.carousel.isMouseMoving ? 0.3 : 0}
      className={css.videoControlBar}
    >
      <IconButton
        name={stores.carousel.isPlaying ? "Pause" : "PlayArrow"}
        onClick={togglePlaying}
      />

      <View row>
        <IconButton name="SkipPrevious" onClick={goToPrevFrame} />
        <IconButton name="SkipNext" onClick={goToNextFrame} />
      </View>

      <View row>
        <Button
          text="A"
          onClick={handleMarkInChange}
          fontWeight={600}
          fontSize="0.9em"
          color="transparent"
          textColor={
            stores.carousel.markIn !== null
              ? stores.carousel.markOut !== null
                ? colors.custom.green
                : colors.custom.orange
              : colors.custom.lightGrey
          }
        />

        <Button
          text="B"
          onClick={handleMarkOutChange}
          fontWeight={600}
          fontSize="0.9em"
          color="transparent"
          textColor={
            stores.carousel.markOut !== null
              ? stores.carousel.markIn !== null
                ? colors.custom.green
                : colors.custom.orange
              : colors.custom.lightGrey
          }
        />
      </View>

      <View column flex={1}>
        <Slider
          value={stores.carousel.curFrame}
          onChange={handleFrameSeek}
          onChangeCommitted={handleFrameSeekCommit}
          min={1}
          max={activeFile?.totalFrames}
          step={1}
          marks={stores.carousel.videoMarks}
          valueLabelDisplay="auto"
          valueLabelFormat={(v) => (
            <View column align="center" justify="center" width="7rem">
              <Text>{`F: ${Fmt.commas(v)} (${round((v / activeFile.totalFrames) * 100, 0)}%)`}</Text>
              <Text>{`${Fmt.duration(Fmt.frameToSec(v, activeFile.frameRate))}`}</Text>
            </View>
          )}
          className={css.slider}
        />
      </View>

      <View row align="center">
        <CustomSlider
          value={stores.carousel.volume}
          onChange={handleVolumeChange}
          disabled={activeFile.audioCodec === "None"}
          min={0}
          max={1}
          step={0.01}
        >
          <IconButton
            name={
              stores.carousel.volume > 0.65
                ? "VolumeUp"
                : stores.carousel.volume > 0.3
                  ? "VolumeDown"
                  : stores.carousel.volume > 0
                    ? "VolumeMute"
                    : "VolumeOff"
            }
            onClick={toggleMute}
          />
        </CustomSlider>

        <CustomSlider
          value={stores.carousel.playbackRate}
          onChange={handlePlaybackRateChange}
          min={0.01}
          max={3}
          step={0.01}
        >
          <Button
            text={`${stores.carousel.playbackRate.toFixed(2)}x`}
            onClick={resetPlaybackRate}
            color="transparent"
            fontSize="0.9em"
          />
        </CustomSlider>
      </View>

      <View column>
        <Text color={colors.custom.white} className={css.videoTime}>
          {Fmt.duration(stores.carousel.curTime)}
        </Text>

        <Text color={colors.custom.lightGrey} className={css.videoTime}>
          {Fmt.duration(activeFile?.duration)}
        </Text>
      </View>
    </View>
  );
});

const CustomSlider = (props: {
  children: JSX.Element;
  disabled?: boolean;
  max: number;
  min: number;
  onChange: (event: any, value: number) => void;
  step: number;
  value: number;
}) => {
  const { css } = useClasses({ isVertical: true });

  const [isDragging, setIsDragging] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  const handleMouseDown = () => setIsDragging(true);
  const handleMouseUp = () => setIsDragging(false);

  const handleMouseEnter = () => setIsVisible(true);
  const handleMouseLeave = () => !isDragging && setIsVisible(false);

  return (
    <View
      column
      justify="center"
      height="100%"
      onMouseLeave={handleMouseLeave}
      padding={{ top: "1rem", bottom: "1rem" }}
    >
      <View onMouseEnter={handleMouseEnter}>{props.children}</View>

      <View display={isVisible ? "block" : "none"} className={css.sliderContainer}>
        <Slider
          value={props?.value}
          onChange={props?.onChange}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          disabled={props?.disabled}
          min={props?.min}
          max={props?.max}
          step={props?.step}
          orientation="vertical"
          valueLabelDisplay="off"
          className={css.slider}
        />
      </View>
    </View>
  );
};

const useClasses = makeClasses((props?: { isVertical: boolean }) => ({
  slider: {
    marginBottom: "0 !important",
    color: colors.custom.lightBlue,
    "& .MuiSlider-markLabel": {
      top: -10,
      fontSize: "0.65em",
      fontWeight: 600,
    },
    "& .MuiSlider-thumb": {
      borderRadius: "0.5rem",
      height: props?.isVertical ? 4 : 18,
      width: props?.isVertical ? 18 : 4,
    },
  },
  sliderContainer: {
    position: "absolute",
    bottom: CONSTANTS.CAROUSEL.VIDEO.CONTROLS_HEIGHT,
    padding: "0.8rem 0.3rem 0",
    height: "8rem",
    backgroundColor: "rgb(0, 0, 0, 0.5)",
    borderRadius: "0.5rem 0.5rem 0 0",
  },
  videoControlBar: {
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0 1rem",
    width: "100%",
    height: CONSTANTS.CAROUSEL.VIDEO.CONTROLS_HEIGHT,
    backgroundColor: "rgb(0, 0, 0, 0.5)",
    cursor: "default",
    zIndex: 5,
    "&:hover": { opacity: 1 },
  },
  videoTime: {
    fontSize: "0.8em",
    lineHeight: 1,
  },
}));
