import { Comp, ContextMenuProps, ProgressBar, View } from "medior/components";
import { colors, makeClasses, openVideoPlaylist, toast } from "medior/utils/client";
import { Fmt } from "medior/utils/common";
import { getConfig } from "medior/utils/server";
import type { FileContinuePoint } from "medior/utils/server/pot-player";

export interface MediaProgramContinueBarProps {
  continuePoint: FileContinuePoint;
}

/**
 * The Continue item of a card with a continue point, which opens the episodes natively from its
 * episode, starting at its bookmark.
 */
export const getContinueMenuItem = (
  continuePoint: FileContinuePoint,
  episodeIds: string[],
): ContextMenuProps["menuItems"][number] => {
  const handleContinue = async () => {
    try {
      await openVideoPlaylist({
        fileId: continuePoint.fileId,
        fileIds: episodeIds,
        seconds: continuePoint.position,
      });

      if (!getConfig().file.videoPlayer.path)
        toast.warn(
          "Opened from the start, as Windows' default program can't seek. Choose a video player in Settings to continue at the bookmark.",
        );
    } catch (error) {
      toast.error(`Failed to continue: ${error.message}`);
    }
  };

  return continuePoint
    ? {
        color: colors.custom.lightBlue,
        icon: "PlayArrow",
        label: `Continue at ${Fmt.duration(continuePoint.position)}`,
        onClick: handleContinue,
      }
    : null;
};

/** How far into its episode a card's continue point is, along the card's bottom edge. */
export const MediaProgramContinueBar = Comp(({ continuePoint }: MediaProgramContinueBarProps) => {
  const { css } = useClasses(null);

  return !continuePoint.duration ? null : (
    <View className={css.root}>
      <ProgressBar numerator={continuePoint.position} denominator={continuePoint.duration} />
    </View>
  );
});

const useClasses = makeClasses({
  // The footer's text keeps room below it, which the bar sits in.
  root: {
    borderBottomLeftRadius: "inherit",
    borderBottomRightRadius: "inherit",
    bottom: 0,
    left: 0,
    overflow: "hidden",
    position: "absolute",
    right: 0,
  },
});
