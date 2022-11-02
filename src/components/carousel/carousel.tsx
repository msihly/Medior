import {
  createContext,
  Dispatch,
  MutableRefObject,
  SetStateAction,
  useContext,
  useRef,
  useState,
} from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import ReactPlayer from "react-player/file";
import Panzoom, { PanzoomObject, PanzoomOptions } from "@panzoom/panzoom";
import { IconButton, Text, View } from "components";
import { dayjs, makeClasses } from "utils";
import { colors, Slider } from "@mui/material";

interface CarouselContextProps {
  activeFileId: string;
  panZoomRef: MutableRefObject<PanzoomObject>;
  selectedFileIds: string[];
  setActiveFileId: Dispatch<SetStateAction<string>>;
}

export const CarouselContext = createContext<CarouselContextProps>(null);

export const Carousel = observer(() => {
  const { activeFileId, panZoomRef } = useContext(CarouselContext);

  const { fileStore } = useStores();
  const activeFile = fileStore.getById(activeFileId);

  const zoomRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<ReactPlayer>(null);

  panZoomRef.current =
    zoomRef.current !== null
      ? Panzoom(zoomRef.current, {
          animate: true,
          contain: "outside",
          cursor: "grab",
          disablePan: activeFile?.isVideo,
          disableZoom: activeFile?.isVideo,
          maxScale: 10,
          minScale: 1,
          panOnlyWhenZoomed: true,
          step: 0.1,
        } as PanzoomOptions)
      : null;

  const [curFrame, setCurFrame] = useState(1);
  const [curTime, setCurTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isVolumeVisible, setIsVolumeVisible] = useState(false);
  const [lastVolume, setLastVolume] = useState(0.5);
  const [volume, setVolume] = useState(0);

  const { css } = useClasses({ isVolumeVisible });

  const handleFrameSeek = (frame: number) => {
    setCurFrame(frame);
    setCurTime(frame / activeFile?.frameRate);
    videoRef.current.seekTo(frame / activeFile?.frameRate);
  };

  const handleVideoProgress = ({ playedSeconds }) => {
    setCurFrame(playedSeconds * activeFile?.frameRate);
    setCurTime(playedSeconds);
  };

  const handleVolumeChange = (vol: number) => {
    setVolume(vol);
    setLastVolume(vol);
  };

  const toggleMute = () => {
    if (volume === 0) setVolume(lastVolume);
    else {
      setLastVolume(lastVolume);
      setVolume(0);
    }
  };

  const togglePlaying = () => setIsPlaying(!isPlaying);

  return (
    <>
      <View ref={zoomRef} className={css.viewContainer}>
        {activeFile?.isVideo ? (
          <View onClick={togglePlaying} className={css.videoContainer}>
            <ReactPlayer
              ref={videoRef}
              url={activeFile?.path}
              playing={isPlaying}
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
          <img
            src={activeFile?.path}
            className={css.image}
            alt={activeFile?.originalName}
            draggable={false}
            loading="lazy"
          />
        )}
      </View>

      {activeFile?.isVideo && (
        <View className={css.videoControlBar}>
          <IconButton name={isPlaying ? "Pause" : "PlayArrow"} onClick={togglePlaying} />

          <View className={css.videoProgressBar}>
            <Slider
              value={curFrame}
              onChange={(_, frame: number) => handleFrameSeek(frame)}
              min={1}
              max={activeFile?.totalFrames}
              step={1}
              valueLabelDisplay="off"
            />
          </View>

          <View onMouseLeave={() => setIsVolumeVisible(false)}>
            <View onMouseEnter={() => setIsVolumeVisible(true)}>
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
                onChange={(_, vol: number) => handleVolumeChange(vol)}
                min={0}
                max={1}
                step={0.01}
                orientation="vertical"
                valueLabelDisplay="off"
              />
            </View>
          </View>

          <View className={css.videoTimeContainer}>
            <Text className={css.videoTimeCurrent}>
              {dayjs.duration(Math.round(curTime * 1000)).format("HH:mm:ss.SSS")}
            </Text>

            <Text className={css.videoTimeTotal}>
              {`\u00A0/\u00A0${dayjs
                .duration(Math.round(activeFile?.duration * 1000))
                .format("HH:mm:ss.SSS")}`}
            </Text>
          </View>
        </View>
      )}
    </>
  );
});

const useClasses = makeClasses((_, { isVolumeVisible }) => ({
  image: {
    borderRadius: "inherit",
    width: "100%",
    objectFit: "contain",
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
    opacity: 0.3,
    "&:hover": {
      opacity: 1,
    },
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
    flexFlow: "row nowrap",
    justifyContent: "center",
    alignItems: "center",
  },
  videoTimeCurrent: {
    lineHeight: 1,
    color: colors.grey["400"],
  },
  videoTimeTotal: {
    marginRight: "0.5rem",
    color: colors.grey["600"],
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
    bottom: "2.75rem",
    padding: "0.8rem 0.2rem",
    height: "8rem",
    backgroundColor: "rgb(0, 0, 0, 0.5)",
    borderRadius: "1rem 1rem 0 0",
  },
}));
