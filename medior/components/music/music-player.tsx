import { SyntheticEvent, useEffect, useRef, useState } from "react";
import { List, ListImperativeAPI, RowComponentProps } from "react-window";
import Color from "color";
import {
  Button,
  Chip,
  Comp,
  FileBase,
  IconButton,
  MEDIA_PROGRAM_BORDER,
  MEDIA_PROGRAM_RADIUS,
  MenuButton,
  RatingButton,
  Slider,
  Text,
  View,
} from "medior/components";
import { MusicLoopMode, MusicPlayerStore, useStores } from "medior/store";
import { colors, makeClasses, toast } from "medior/utils/client";
import { dayjs, Fmt, getMusicTrackTitle } from "medior/utils/common";

/**
 * The compact player's sizes, which on a display at Windows' 125% scale match MusicBee's compact
 * player as it shows beside Medior there.
 */
const COMPACT_CONTROLS_HEIGHT = "2.4rem";
const COMPACT_ICON_SIZE = "1.25rem";
const QUEUE_ROW_HEIGHT = 27;

/** The opacity at each even step of the cover's fade, eased so the fade shows no bands. */
const FADE_STEPS = [0, 0.02, 0.08, 0.18, 0.32, 0.5, 0.68, 0.84, 0.95, 1];

const LOOP_TOOLTIPS: Record<MusicLoopMode, string> = {
  all: "Looping Queue",
  off: "Loop Off",
  one: "Looping Track",
};

/** Fades from clear into the color through the fade's eased steps. */
const getFadeGradient = (color: string) =>
  `linear-gradient(to bottom, ${FADE_STEPS.map(
    (alpha, index) =>
      `${Color(color).alpha(alpha).string()} ${(index / (FADE_STEPS.length - 1)) * 100}%`,
  ).join(", ")})`;

/** A track time as MusicBee's compact player shows it, such as "4:24", with hours only when needed. */
const formatCompactTime = (seconds: number) => {
  const time = dayjs.duration(seconds, "s");

  return time.asHours() >= 1
    ? `${Math.floor(time.asHours())}:${time.format("mm:ss")}`
    : time.format("m:ss");
};

/**
 * Reads the playing track's cover art as the track changes: its dominant colors while Settings
 * colors the player with them, and the image itself when asked.
 */
const usePlayerCover = (withImage: boolean) => {
  const stores = useStores();
  const store = stores.music.player;

  const fileId = store.file?.id;
  const withColors = stores.home.settings.music.coverColors;

  useEffect(() => {
    (async () => {
      const res = await store.loadCover({ withColors, withImage });
      if (!res.success) console.error("Failed to read the playing track's cover art:", res.error);
    })();
  }, [fileId, withColors]);
};

/** The element the music player plays through, which reports its progress back to the player. */
export const MusicPlayerAudio = Comp(() => {
  const stores = useStores();
  const store = stores.music.player;

  const audioRef = useRef<HTMLAudioElement>(null);

  // Another player mounted meanwhile keeps the player when this one unmounts.
  useEffect(() => {
    const audio = audioRef.current;
    store.attachAudio(audio);

    return () => {
      store.detachAudio(audio);
    };
  }, []);

  const handleDurationChange = (event: SyntheticEvent<HTMLAudioElement>) =>
    store.setDuration(
      Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0,
    );

  const handlePause = () => store.setIsPlaying(false);

  const handlePlay = () => store.setIsPlaying(true);

  const handleTimeUpdate = (event: SyntheticEvent<HTMLAudioElement>) =>
    store.setCurrentTime(event.currentTarget.currentTime);

  return (
    <View
      component="audio"
      ref={audioRef}
      preload="auto"
      onDurationChange={handleDurationChange}
      onEnded={store.handleEnded}
      onError={store.handleError}
      onLoadedMetadata={store.handleLoadedMetadata}
      onPause={handlePause}
      onPlay={handlePlay}
      onTimeUpdate={handleTimeUpdate}
      display="none"
    />
  );
});

/**
 * The track playing with its controls, shown in the music view while the player has one, in its
 * cover art's colors while Settings uses them.
 */
export const MusicPlayerBar = Comp(() => {
  const stores = useStores();
  const store = stores.music.player;

  usePlayerCover(false);

  if (!store.file) return null;

  return (
    <View
      row
      align="center"
      spacing="1rem"
      padding={{ all: "0.5rem 1rem" }}
      bgColor={store.coverTheme?.bar ?? colors.foreground}
      borders={{ top: MEDIA_PROGRAM_BORDER }}
    >
      <PlayerTrack />

      <PlayerControls />

      <PlayerSeek />

      <PlayerVolume />

      <PlayerModes />

      <IconButton name="OpenInNew" tooltip="Pop Out" onClick={store.popOut} />

      <IconButton name="Close" tooltip="Stop" onClick={store.stop} />
    </View>
  );
});

/**
 * The compact player window's player, laid out like MusicBee's compact player: the square cover art
 * with the track's title and artist on it as music cards show them, the queue beside it, and the
 * controls along the bottom.
 */
export const MusicCompactPlayer = Comp(() => {
  const stores = useStores();
  const store = stores.music.player;

  const { css } = useClasses(null);

  // The track's own cover art replaces its smaller thumbnail once read, for tracks with any.
  usePlayerCover(true);

  const file = store.file;
  const title = getMusicTrackTitle(file);
  const barColor = store.coverTheme?.bar ?? colors.foreground;

  const handleRate = async (rating: number) => {
    const res = await store.rate(rating);
    if (!res.success) toast.error(res.error);
  };

  return (
    <View column flex={1} minHeight={0}>
      <View row flex={1} minHeight={0}>
        <View position="relative" flex="none" overflow="hidden" className={css.cover}>
          {store.coverUrl ? (
            <View
              component="img"
              src={store.coverUrl}
              alt={title}
              draggable={false}
              className={css.coverImage}
            />
          ) : (
            <FileBase.Image
              thumb={file.thumb}
              fileId={file.id}
              isCorrupted={file.isCorrupted}
              title={title}
              fit="cover"
            />
          )}

          <FileBase.Footer height="8rem" background={getFadeGradient(barColor)}>
            <View column width="100%" overflow="hidden">
              <FileBase.FooterText text={title} textProps={{ fontWeight: 600 }} />

              <FileBase.FooterText
                text={file.music?.artist}
                textProps={{ color: colors.custom.lightGrey, fontSize: "0.75em" }}
              />
            </View>
          </FileBase.Footer>
        </View>

        <PlayerQueue />
      </View>

      <View
        row
        flex="none"
        align="center"
        spacing="0.5rem"
        height={COMPACT_CONTROLS_HEIGHT}
        padding={{ all: "0 0.5rem" }}
        bgColor={barColor}
        borders={{ top: MEDIA_PROGRAM_BORDER }}
      >
        <PlayerControls isCompact />

        <PlayerVolumeMenu />

        <PlayerSeek isCompact />

        <RatingButton rating={file.rating} setRating={handleRate} />

        <PlayerModes isCompact />

        <IconButton
          name="CloseFullscreen"
          tooltip="Dock"
          onClick={store.dock}
          color={colors.custom.lightGrey}
          size="small"
          iconProps={{ size: COMPACT_ICON_SIZE }}
        />
      </View>
    </View>
  );
});

interface PlayerSizeProps {
  /** Sized for the compact player window, as MusicBee's compact player is. */
  isCompact?: boolean;
}

/** Previous, play, and next, which the compact player sizes alike, as MusicBee's does. */
const PlayerControls = Comp(({ isCompact = false }: PlayerSizeProps) => {
  const stores = useStores();
  const store = stores.music.player;

  const buttonSize = isCompact ? "small" : "medium";
  const iconProps = { size: isCompact ? COMPACT_ICON_SIZE : undefined };

  const handleNext = async () => {
    const res = await store.next();
    if (!res.success) toast.error(res.error);
  };

  const handlePrevious = async () => {
    const res = await store.previous();
    if (!res.success) toast.error(res.error);
  };

  return (
    <View row align="center" flex="none">
      <IconButton
        name="SkipPrevious"
        tooltip="Previous"
        onClick={handlePrevious}
        size={buttonSize}
        iconProps={iconProps}
      />

      <IconButton
        name={store.isPlaying ? "Pause" : "PlayArrow"}
        tooltip={store.isPlaying ? "Pause" : "Play"}
        onClick={store.togglePlay}
        size={buttonSize}
        iconProps={{ size: isCompact ? COMPACT_ICON_SIZE : "1.8rem" }}
      />

      <IconButton
        name="SkipNext"
        tooltip="Next"
        onClick={handleNext}
        disabled={!store.hasNext}
        size={buttonSize}
        iconProps={iconProps}
      />
    </View>
  );
});

/** Shuffle and loop, which take the cover art's accent while on, or else blue. */
const PlayerModes = Comp(({ isCompact = false }: PlayerSizeProps) => {
  const stores = useStores();
  const store = stores.music.player;

  const activeColor = store.coverTheme?.accent ?? colors.custom.blue;
  const buttonSize = isCompact ? "small" : "medium";
  const iconProps = { size: isCompact ? COMPACT_ICON_SIZE : undefined };

  return (
    <View row align="center" flex="none">
      <IconButton
        name="Shuffle"
        tooltip={store.isShuffled ? "Shuffling" : "Shuffle Off"}
        onClick={store.toggleShuffle}
        color={store.isShuffled ? activeColor : colors.custom.lightGrey}
        size={buttonSize}
        iconProps={iconProps}
      />

      <IconButton
        name={store.loopMode === "one" ? "RepeatOne" : "Repeat"}
        tooltip={LOOP_TOOLTIPS[store.loopMode]}
        onClick={store.cycleLoopMode}
        color={store.loopMode === "off" ? colors.custom.lightGrey : activeColor}
        size={buttonSize}
        iconProps={iconProps}
      />
    </View>
  );
});

/**
 * The queue as a numbered list, which loads the labels of the tracks it shows and follows the
 * track playing. A double-clicked track plays.
 */
const PlayerQueue = Comp(() => {
  const stores = useStores();
  const store = stores.music.player;

  const listRef = useRef<ListImperativeAPI>(undefined);

  useEffect(() => {
    listRef.current?.scrollToRow({ align: "smart", index: store.index });
  }, [store.index]);

  const handleRowsRendered = (
    _: unknown,
    { startIndex, stopIndex }: { startIndex: number; stopIndex: number },
  ) => store.loadQueueLabels(store.fileIds.slice(startIndex, stopIndex + 1));

  return (
    <View
      column
      flex={1}
      minWidth={0}
      padding={{ all: "0.25rem 0" }}
      bgColor={store.coverTheme?.queue}
    >
      <List
        listRef={listRef}
        onRowsRendered={handleRowsRendered}
        rowComponent={QueueRow}
        rowCount={store.fileIds.length}
        rowHeight={QUEUE_ROW_HEIGHT}
        rowProps={{ store }}
      />
    </View>
  );
});

interface QueueRowProps {
  store: MusicPlayerStore;
}

const QueueRow = ({ index, store, style }: RowComponentProps<QueueRowProps>) => (
  <QueueItem index={index} store={store} style={style} />
);

interface QueueItemProps extends Pick<RowComponentProps<QueueRowProps>, "index" | "style"> {
  store: MusicPlayerStore;
}

/** A queued track, which follows its label loading and the track playing. */
const QueueItem = Comp(({ index, store, style }: QueueItemProps) => {
  const fileId = store.fileIds[index];
  const isCurrent = index === store.index;
  const label = store.queueLabels.get(fileId);

  const { css } = useQueueRowClasses({ isCurrent, isThemed: !!store.coverTheme });

  const handleDoubleClick = async () => {
    const res = await store.playIndex(index);
    if (!res.success) toast.error(res.error);
  };

  return (
    <View
      row
      align="center"
      spacing="0.5rem"
      padding={{ all: "0 0.75rem" }}
      onDoubleClick={handleDoubleClick}
      className={css.row}
      style={style}
    >
      <Text
        flex="none"
        width="2.5rem"
        textAlign="right"
        color={colors.custom.lightGrey}
        fontSize="0.8rem"
      >
        {`${Fmt.commas(index + 1)}.`}
      </Text>

      {/* The tooltip's wrapper shrinks with the row, so a long label ends in an ellipsis. */}
      <Text
        flex={1}
        minWidth={0}
        fontSize="0.8rem"
        fontWeight={isCurrent ? 600 : undefined}
        color={label === null ? colors.custom.lightGrey : undefined}
        tooltip={label}
        tooltipProps={{ flexShrink: 1, viewProps: { flex: 1, minWidth: 0 } }}
      >
        {label === null ? "Not in the library" : label}
      </Text>
    </View>
  );
});

/**
 * The track's position, which the slider seeks to once let go, as the video controls do. The
 * compact player shows times as MusicBee's does, sized to fit them.
 */
const PlayerSeek = Comp(({ isCompact = false }: PlayerSizeProps) => {
  const stores = useStores();
  const store = stores.music.player;

  const { css } = useClasses(null);

  const [dragTime, setDragTime] = useState<number>(null);

  const time = dragTime ?? Math.min(store.currentTime, store.duration);
  const formatTime = isCompact ? formatCompactTime : Fmt.duration;
  const fontSize = isCompact ? "0.75rem" : "0.85em";
  // A digit wide per character, which fits the track's length and so the time played too.
  const timeWidth = isCompact ? `${formatCompactTime(store.duration).length}ch` : "4.5rem";

  const handleCommit = (value: number) => {
    setDragTime(null);
    store.seek(value);
  };

  return (
    <View row flex={1} align="center" minWidth={0} spacing="0.6rem">
      <Text
        flex="none"
        width={timeWidth}
        textAlign="right"
        color={colors.custom.lightGrey}
        fontSize={fontSize}
        className={css.time}
      >
        {formatTime(time)}
      </Text>

      <Slider
        value={time}
        min={0}
        max={store.duration || 1}
        step={0.1}
        setValue={setDragTime}
        onCommit={handleCommit}
        color={store.coverTheme?.accent}
        flex={1}
      />

      <Text
        flex="none"
        width={timeWidth}
        color={colors.custom.lightGrey}
        fontSize={fontSize}
        className={css.time}
      >
        {formatTime(store.duration)}
      </Text>
    </View>
  );
});

/** The track playing, with its cover, title, artist, and place in the queue. */
const PlayerTrack = Comp(() => {
  const stores = useStores();
  const store = stores.music.player;

  const file = store.file;
  const title = getMusicTrackTitle(file);

  return (
    <View row flex={1} align="center" minWidth={0} maxWidth="22rem" spacing="0.75rem">
      <View
        flex="none"
        width="3rem"
        height="3rem"
        overflow="hidden"
        borderRadiuses={{ all: MEDIA_PROGRAM_RADIUS }}
      >
        <FileBase.Image
          thumb={file.thumb}
          fileId={file.id}
          isCorrupted={file.isCorrupted}
          title={title}
          fit="cover"
        />
      </View>

      <View column flex={1} minWidth={0}>
        <Text fontWeight={600} tooltip={title}>
          {title}
        </Text>

        {file.music?.artist && (
          <Text color={colors.custom.lightGrey} fontSize="0.8em">
            {file.music.artist}
          </Text>
        )}
      </View>

      <Chip
        label={Fmt.commas(store.index + 1)}
        denominator={Fmt.commas(store.fileIds.length)}
        bgColor={store.coverTheme?.accent}
      />
    </View>
  );
});

const PlayerVolume = Comp(() => {
  const stores = useStores();
  const store = stores.music.player;

  return (
    <View row align="center" flex="none" width="8rem" spacing="0.5rem">
      <IconButton
        name={store.volume > 0 ? "VolumeUp" : "VolumeOff"}
        tooltip={store.volume > 0 ? "Mute" : "Unmute"}
        onClick={store.toggleMute}
        color={colors.custom.lightGrey}
        size="small"
      />

      <Slider
        value={store.volume}
        min={0}
        max={1}
        step={0.01}
        setValue={store.changeVolume}
        color={store.coverTheme?.accent}
        flex={1}
      />
    </View>
  );
});

/**
 * The volume as MusicBee's compact player shows it: the speaker toggles mute, and the number shows
 * the slider once clicked. The number's width fits "100", so the controls beside it stay put as the
 * volume changes.
 */
const PlayerVolumeMenu = Comp(() => {
  const stores = useStores();
  const store = stores.music.player;

  return (
    <View row align="center" flex="none">
      <IconButton
        name={store.volume > 0 ? "VolumeUp" : "VolumeOff"}
        tooltip={store.volume > 0 ? "Mute" : "Unmute"}
        onClick={store.toggleMute}
        color={colors.custom.lightGrey}
        size="small"
        iconProps={{ size: COMPACT_ICON_SIZE }}
      />

      <MenuButton
        menuWidth="10rem"
        anchorOrigin={{ horizontal: "center", vertical: "top" }}
        transformOrigin={{ horizontal: "center", vertical: "bottom" }}
        button={(onOpen) => (
          <Button
            text={String(Math.round(store.volume * 100))}
            onClick={onOpen}
            color="transparent"
            colorOnHover={colors.control}
            textColor={colors.custom.lightGrey}
            fontSize="0.75rem"
            tooltip="Volume"
            width="2.25rem"
            padding={{ all: "0.25rem" }}
          />
        )}
      >
        <View padding={{ all: "0.5rem 1rem" }}>
          <Slider
            value={store.volume}
            min={0}
            max={1}
            step={0.01}
            setValue={store.changeVolume}
            color={store.coverTheme?.accent}
          />
        </View>
      </MenuButton>
    </View>
  );
});

const useClasses = makeClasses({
  /**
   * The cover fills the height above the controls, as wide as it's tall, leaving the queue at least
   * 30% of the window. A narrower window crops the cover's sides rather than leaving a gap.
   */
  cover: {
    aspectRatio: "1",
    height: "100%",
    maxWidth: "70vw",
  },
  coverImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  // Every digit takes the same width, so a time keeps its width as it counts.
  time: {
    fontVariantNumeric: "tabular-nums",
  },
});

interface QueueRowClassesProps {
  isCurrent: boolean;
  /** Cover art colors the queue, which a light overlay marks rows on instead of a control color. */
  isThemed: boolean;
}

const useQueueRowClasses = makeClasses((props: QueueRowClassesProps) => {
  const markColor = props.isThemed ? "rgba(255, 255, 255, 0.1)" : colors.control;

  return {
    // Its padding stays within the row's given width, so rows never overflow the queue.
    row: {
      boxSizing: "border-box",
      backgroundColor: props.isCurrent ? markColor : undefined,
      cursor: "pointer",
      userSelect: "none",
      "&:hover": {
        backgroundColor: markColor,
      },
    },
  };
});
