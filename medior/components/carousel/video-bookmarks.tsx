import { FileSchema } from "medior/_generated/server";
import { Comp, Icon, Tooltip, View } from "medior/components";
import { colors, makeClasses } from "medior/utils/client";
import { Fmt } from "medior/utils/common";

export type VideoBookmark = FileSchema["bookmarks"][number];

export interface VideoBookmarksProps {
  bookmarks: VideoBookmark[];
  duration: number;
  onSeek: (bookmark: VideoBookmark) => void;
}

/**
 * Ribbons above the seek bar at each of Medior's own bookmarks, apart from the chapter ticks and
 * A-B marks on it, timed in their tooltips and seeking there.
 */
export const VideoBookmarks = Comp(({ bookmarks, duration, onSeek }: VideoBookmarksProps) => {
  const { css } = useClasses(null);

  // Without a duration, ribbons have no place along the seek bar.
  return !duration ? null : (
    <View className={css.root}>
      {bookmarks.map((bookmark) => (
        <BookmarkRibbon key={bookmark.id} bookmark={bookmark} duration={duration} onSeek={onSeek} />
      ))}
    </View>
  );
});

interface BookmarkRibbonProps extends Pick<VideoBookmarksProps, "duration" | "onSeek"> {
  bookmark: VideoBookmark;
}

const BookmarkRibbon = Comp(({ bookmark, duration, onSeek }: BookmarkRibbonProps) => {
  const { css } = useRibbonClasses({ left: `${(bookmark.time / duration) * 100}%` });

  const handleClick = () => onSeek(bookmark);

  return (
    <View className={css.ribbon}>
      <Tooltip title={`Bookmark · ${Fmt.duration(bookmark.time)}`} placement="top">
        <View onClick={handleClick} className={css.hitArea}>
          <Icon name="Bookmark" size="1rem" color={colors.custom.yellow} />
        </View>
      </Tooltip>
    </View>
  );
});

const useClasses = makeClasses({
  // Spans the slider's rail at its height, passing clicks between ribbons on to the slider.
  root: {
    height: 0,
    left: 0,
    pointerEvents: "none",
    position: "absolute",
    right: 0,
    top: "50%",
  },
});

interface RibbonClassesProps {
  left: string;
}

const useRibbonClasses = makeClasses((props: RibbonClassesProps) => ({
  hitArea: {
    cursor: "pointer",
    display: "flex",
    "&:hover": { filter: "brightness(1.3)" },
  },
  // Sits above the rail and the slider's thumb, clear of the chapter ticks across it.
  ribbon: {
    left: props.left,
    pointerEvents: "auto",
    position: "absolute",
    top: 0,
    transform: "translate(-50%, calc(-100% - 6px))",
  },
}));
