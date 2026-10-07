import { useCallback, useContext, useMemo, useState } from "react";
import { Button, Comp, IconButton, Slider, Text, VideoWaveform, View } from "medior/components";
import { useStores } from "medior/store";
import { colors, makeClasses, toast, Toaster } from "medior/utils/client";
import { CONSTANTS, Fmt, round, throttle } from "medior/utils/common";
import { VideoContext } from "medior/views";
import { CustomSlider } from "./video-control-slider";

export const VideoControls = Comp(() => {
  const stores = useStores();
  const store = stores.carousel;

  const activeFile = store.getActiveFile();

  const isCaptionsActive =
    store.isCaptionsVisible && Boolean(activeFile?.transcription?.segments?.length);

  const isWaveformActive = store.isWaveformVisible && Boolean(activeFile?.waveformPeaks?.length);

  const videoContext = useContext(VideoContext);

  const [lastPlayingState, setLastPlayingState] = useState(false);

  const { css } = useClasses(null);

  const toaster = new Toaster();

  const goToFrame = (frame: number) => {
    store.setIsPlaying(false);
    setCurFrame(frame);
    seekVideoPlayer(frame);
    toaster.toast(`Frame: ${Fmt.commas(frame)}`);
  };

  const goToNextFrame = () => goToFrame(Math.min(store.curFrame + 1, activeFile?.totalFrames));

  const goToPrevFrame = () => goToFrame(Math.max(store.curFrame - 1, 1));

  const handleFrameSeek = (frame: number) => {
    if (store.isPlaying) {
      setLastPlayingState(true);
      store.setIsPlaying(false);
    }

    setCurFrame(frame);

    if (store.requiresTranscoding) transcode(frame);
    else seekVideoPlayer(frame);
  };

  const handleFrameSeekCommit = (frame: number) => {
    if (store.requiresTranscoding) {
      setCurFrame(frame);
      seekVideoPlayer(frame);
    }

    if (lastPlayingState) {
      store.setIsPlaying(true);
      setLastPlayingState(false);
    }
  };

  const handleWaveformSeek = useCallback(
    (time: number) => {
      const frame = round(time * activeFile.frameRate, 0);

      setCurFrame(frame);

      if (store.requiresTranscoding) transcode(frame);
      else videoContext?.current?.seekTo(time, "seconds");
    },
    [activeFile?.id],
  );

  const getNewMark = (frame: number) =>
    store.videoMarks.map((m) => m.value).includes(frame) ? null : frame;

  const handleMarkInChange = () => {
    const newMarkIn = getNewMark(store.curFrame);

    if (![newMarkIn, store.markOut].includes(null) && newMarkIn > store.markOut)
      return toast.error("Mark In (A) must be before Mark Out (B)");

    store.setMarkIn(newMarkIn);
    toaster.toast(
      newMarkIn === null ? "Mark In (A) Cleared" : `Mark In (A): ${Fmt.commas(newMarkIn)}`,
    );
  };

  const handleMarkOutChange = () => {
    const newMarkOut = getNewMark(store.curFrame);

    if (![store.markIn, newMarkOut].includes(null) && newMarkOut < store.markIn)
      return toast.error("Mark Out (B) must be after Mark In (A)");

    store.setMarkOut(newMarkOut);
    toaster.toast(
      newMarkOut === null ? "Mark Out (B) Cleared" : `Mark Out (B): ${Fmt.commas(newMarkOut)}`,
    );
  };

  const handlePlaybackRateChange = (rate: number) => store.setPlaybackRate(rate);

  const handleTranscodeBitrateChange = (bitrate: number) => store.setTranscodeBitrate(bitrate);

  const handleTranscodeBitrateCommit = () =>
    store.requiresTranscoding && seekVideoPlayer(store.curFrame);

  const handleVolumeChange = (vol: number) => store.setVolumePreference(vol);

  const resetPlaybackRate = () => store.setPlaybackRate(1);

  const seekVideoPlayer = (frame: number) => {
    if (store.requiresTranscoding)
      store.transcodeVideo({
        seekTime: Fmt.frameToSec(frame, activeFile.frameRate),
      });
    else videoContext?.current?.seekTo(frame / activeFile.totalFrames, "fraction");
  };

  const setCurFrame = (frame: number) => store.setCurFrame(frame, activeFile.frameRate);

  const toggleMute = () => store.toggleMute();

  const togglePlaying = () => store.toggleIsPlaying();

  const transcode = useMemo(
    () =>
      throttle(async (frame: number) => {
        if (store.activeFileId !== activeFile?.id || store.curFrame !== frame) return;

        return await store.transcodeVideo({
          onFirstFrames: () => setCurFrame(frame),
          seekTime: Fmt.frameToSec(frame, activeFile.frameRate),
        });
      }, 200),
    [activeFile?.id],
  );

  return (
    <View
      row
      spacing="0.5rem"
      position={store.isPinned ? undefined : "absolute"}
      opacity={store.isPinned ? 1 : store.isMouseMoving ? 0.3 : 0}
      className={css.videoControlBar}
    >
      <IconButton name={store.isPlaying ? "Pause" : "PlayArrow"} onClick={togglePlaying} />

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
            store.markIn !== null
              ? store.markOut !== null
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
            store.markOut !== null
              ? store.markIn !== null
                ? colors.custom.green
                : colors.custom.orange
              : colors.custom.lightGrey
          }
        />
      </View>

      <View column flex={1} height="100%" justify="center" className={css.progressControl}>
        {store.isWaveformVisible && (
          <VideoWaveform
            currentTime={store.curTime}
            duration={activeFile.duration}
            onSeek={handleWaveformSeek}
            peaks={activeFile.waveformPeaks}
          />
        )}

        <Slider
          value={store.curFrame}
          setValue={handleFrameSeek}
          onCommit={handleFrameSeekCommit}
          min={1}
          max={activeFile?.totalFrames}
          step={1}
          marks={store.videoMarks}
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
        <IconButton
          name={isCaptionsActive ? "ClosedCaption" : "ClosedCaptionOff"}
          onClick={store.toggleCaptions}
          disabled={!activeFile.transcription?.segments?.length}
          iconProps={{
            color: isCaptionsActive ? colors.custom.lightBlue : colors.custom.lightGrey,
          }}
          tooltip={isCaptionsActive ? "Hide Captions" : "Show Captions"}
        />

        <IconButton
          name="GraphicEq"
          onClick={store.toggleWaveform}
          disabled={!activeFile.waveformPeaks?.length}
          iconProps={{
            color: isWaveformActive ? colors.custom.lightBlue : colors.custom.lightGrey,
          }}
          tooltip={isWaveformActive ? "Hide Waveform" : "Show Waveform"}
        />

        <CustomSlider
          value={store.volume}
          setValue={handleVolumeChange}
          disabled={activeFile.audioCodec === "None"}
          min={0}
          max={1}
          step={0.01}
        >
          <IconButton
            name={
              store.volume > 0.65
                ? "VolumeUp"
                : store.volume > 0.3
                  ? "VolumeDown"
                  : store.volume > 0
                    ? "VolumeMute"
                    : "VolumeOff"
            }
            onClick={toggleMute}
          />
        </CustomSlider>

        <CustomSlider
          value={store.playbackRate}
          setValue={handlePlaybackRateChange}
          min={0.01}
          max={3}
          step={0.01}
        >
          <Button
            text={`${store.playbackRate.toFixed(2)}x`}
            onClick={resetPlaybackRate}
            color="transparent"
            fontSize="0.9em"
          />
        </CustomSlider>

        {store.requiresTranscoding && (
          <CustomSlider
            value={store.transcodeBitrate}
            setValue={handleTranscodeBitrateChange}
            onCommit={handleTranscodeBitrateCommit}
            min={0.5}
            max={12}
            step={0.5}
          >
            <Button
              text={`${store.transcodeBitrate.toFixed(1)}M`}
              icon="Speed"
              color="transparent"
              fontSize="0.9em"
            />
          </CustomSlider>
        )}
      </View>

      <View column>
        <Text color={colors.custom.white} fontSize="0.8em">
          {Fmt.duration(store.curTime)}
        </Text>

        <Text color={colors.custom.lightGrey} fontSize="0.8em">
          {Fmt.duration(activeFile?.duration)}
        </Text>
      </View>
    </View>
  );
});

const useClasses = makeClasses({
  progressControl: {
    position: "relative",
  },
  slider: {
    marginBottom: "0 !important",
  },
  videoControlBar: {
    "&:hover": { opacity: 1 },
    alignItems: "center",
    backgroundColor: "rgb(0, 0, 0, 0.5)",
    bottom: 0,
    cursor: "default",
    height: CONSTANTS.CAROUSEL.VIDEO.CONTROLS_HEIGHT,
    justifyContent: "space-between",
    left: 0,
    padding: "0 1rem",
    right: 0,
    width: "100%",
    zIndex: 5,
  },
});
