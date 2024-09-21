import { useRef, useState } from "react";
import ReactPlayer from "react-player";
import { observer, useStores } from "medior/store";
import { Slider } from "@mui/material";
import { IconButton, Text, View } from "medior/components";
import { colors, CONSTANTS, duration, makeClasses, round } from "medior/utils";

export const VideoControls = observer(() => {
  const stores = useStores();
  const activeFile = stores.file.getById(stores.carousel.activeFileId);

  const [lastPlayingState, setLastPlayingState] = useState(false);
  const [isVolumeVisible, setIsVolumeVisible] = useState(false);
  const [lastVolume, setLastVolume] = useState(0.5);

  const videoRef = useRef<ReactPlayer>(null);

  const { css } = useClasses({
    isMouseMoving: stores.carousel.isMouseMoving,
    isPinned: stores.carousel.isPinned,
    isVideo: activeFile?.isVideo,
    isVolumeVisible,
  });

  const handleFrameChange = (frame: number) => {
    stores.carousel.setCurFrame(frame);
    const time = round(frame / activeFile?.frameRate || 1, 3);
    stores.carousel.setCurTime(time);
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

  const handleVolumeChange = (_, vol: number) => {
    stores.carousel.setVolume(vol);
    setLastVolume(vol);
  };

  const handleVolumeEnter = () => setIsVolumeVisible(true);

  const handleVolumeLeave = () => setIsVolumeVisible(false);

  const toggleMute = () => {
    if (stores.carousel.volume === 0) stores.carousel.setVolume(lastVolume);
    else {
      setLastVolume(lastVolume);
      stores.carousel.setVolume(0);
    }
  };

  const togglePlaying = () => stores.carousel.setIsPlaying(!stores.carousel.isPlaying);

  return (
    <View row spacing="0.5rem" className={css.videoControlBar}>
      <IconButton
        name={stores.carousel.isPlaying ? "Pause" : "PlayArrow"}
        onClick={togglePlaying}
      />

      <View column flex={1}>
        <Slider
          value={stores.carousel.curFrame}
          onChange={handleFrameSeek}
          onChangeCommitted={handleFrameSeekCommit}
          min={1}
          max={activeFile?.totalFrames}
          step={1}
          valueLabelDisplay="auto"
          className={css.slider}
        />
      </View>

      <View column justify="center" height="100%" onMouseLeave={handleVolumeLeave}>
        <View onMouseEnter={handleVolumeEnter}>
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
        </View>

        <View className={css.volumeSlider}>
          <Slider
            value={stores.carousel.volume}
            onChange={handleVolumeChange}
            min={0}
            max={1}
            step={0.01}
            orientation="vertical"
            valueLabelDisplay="off"
            className={css.slider}
          />
        </View>
      </View>

      <View column>
        <Text color={colors.custom.white} className={css.videoTime}>
          {duration(stores.carousel.curTime)}
        </Text>

        <Text color={colors.custom.lightGrey} className={css.videoTime}>
          {duration(activeFile?.duration)}
        </Text>
      </View>
    </View>
  );
});

interface ClassesProps {
  isMouseMoving: boolean;
  isPinned: boolean;
  isVideo: boolean;
  isVolumeVisible: boolean;
}

const useClasses = makeClasses((props: ClassesProps) => ({
  slider: {
    color: colors.custom.lightBlue,
  },
  videoControlBar: {
    position: props.isPinned ? undefined : "absolute",
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
    opacity: props.isPinned ? 1 : props.isMouseMoving ? 0.3 : 0,
    "&:hover": { opacity: 1 },
  },
  videoTime: {
    fontSize: "0.8em",
    lineHeight: 1,
  },
  volumeSlider: {
    display: props.isVolumeVisible ? "block" : "none",
    position: "absolute",
    bottom: CONSTANTS.CAROUSEL.VIDEO.CONTROLS_HEIGHT,
    padding: "0.8rem 0.3rem 0.4rem",
    height: "8rem",
    backgroundColor: "rgb(0, 0, 0, 0.5)",
    borderRadius: "0.5rem 0.5rem 0 0",
  },
}));
