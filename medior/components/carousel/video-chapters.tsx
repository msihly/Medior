import { Comp, Tooltip, View } from "medior/components";
import { colors, makeClasses } from "medior/utils/client";
import { Fmt } from "medior/utils/common";
import type { VideoChapter } from "medior/utils/server/ffmpeg";

export interface VideoChaptersProps {
  chapters: VideoChapter[];
  duration: number;
  onSeek: (chapter: VideoChapter) => void;
}

/** Ticks on the seek bar where each chapter starts, named in their tooltips and seeking there. */
export const VideoChapters = Comp(({ chapters, duration, onSeek }: VideoChaptersProps) => {
  const { css } = useClasses(null);

  return (
    <View className={css.root}>
      {chapters.map((chapter, index) => (
        <ChapterTick
          key={`${chapter.start}-${index}`}
          chapter={chapter}
          duration={duration}
          index={index}
          onSeek={onSeek}
        />
      ))}
    </View>
  );
});

interface ChapterTickProps extends Pick<VideoChaptersProps, "duration" | "onSeek"> {
  chapter: VideoChapter;
  index: number;
}

const ChapterTick = Comp(({ chapter, duration, index, onSeek }: ChapterTickProps) => {
  const { css } = useTickClasses({ left: `${(chapter.start / duration) * 100}%` });

  const handleClick = () => onSeek(chapter);

  return (
    <View className={css.tick}>
      <Tooltip
        title={`${chapter.title ?? `Chapter ${index + 1}`} · ${Fmt.duration(chapter.start)}`}
        placement="top"
      >
        <View onClick={handleClick} className={css.hitArea}>
          <View className={css.mark} />
        </View>
      </Tooltip>
    </View>
  );
});

const useClasses = makeClasses({
  // Spans the slider's rail at its height, passing clicks between ticks on to the slider.
  root: {
    height: 0,
    left: 0,
    pointerEvents: "none",
    position: "absolute",
    right: 0,
    top: "50%",
  },
});

interface TickClassesProps {
  left: string;
}

const useTickClasses = makeClasses((props: TickClassesProps) => ({
  hitArea: {
    cursor: "pointer",
    padding: "0 3px",
    "&:hover > *": { backgroundColor: colors.custom.lightBlue },
  },
  mark: {
    backgroundColor: "rgb(245 245 245 / 0.8)",
    borderRadius: 1,
    height: 14,
    width: 3,
  },
  tick: {
    left: props.left,
    pointerEvents: "auto",
    position: "absolute",
    top: 0,
    transform: "translate(-50%, -50%)",
  },
}));
