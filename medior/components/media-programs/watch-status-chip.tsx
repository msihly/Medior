import { ComponentProps } from "react";
import { Comp, FileBase, IconName } from "medior/components";
import { colors, CssColor } from "medior/utils/client";
import { Fmt, MEDIA_PROGRAM_WATCH_STATUSES, MediaProgramWatchStatus } from "medior/utils/common";

const WATCH_STATUS_COLORS: Record<MediaProgramWatchStatus, CssColor> = {
  dropped: colors.custom.red,
  inactive: colors.custom.orange,
  unwatched: colors.custom.grey,
  watched: colors.custom.green,
  watching: colors.custom.blue,
};

/** A watch status's color, icon, and label, which mark a rewatch. */
export const getWatchStatusMeta = (watchStatus: MediaProgramWatchStatus, isRewatching: boolean) => {
  const label = MEDIA_PROGRAM_WATCH_STATUSES.find(({ value }) => value === watchStatus)?.label;

  return {
    bgColor: WATCH_STATUS_COLORS[watchStatus],
    icon: isRewatching ? ("Replay" as IconName) : undefined,
    label: isRewatching ? `${label} · Rewatching` : label,
  };
};

export interface WatchStatusChipProps extends Omit<
  ComponentProps<typeof FileBase.Chip>,
  "bgColor" | "icon" | "label"
> {
  isRewatching?: boolean;
  total: number;
  watched: number;
  /** A program's own status; a season's follows its watched episodes. */
  watchStatus?: MediaProgramWatchStatus;
}

/** Watched episodes over all of them as a fraction, in their watch status's color. */
export const WatchStatusChip = Comp(
  ({ isRewatching = false, total, watched, watchStatus, ...props }: WatchStatusChipProps) => {
    const status =
      watchStatus ??
      (total > 0 && watched === total ? "watched" : watched > 0 ? "watching" : "unwatched");
    const meta = getWatchStatusMeta(status, isRewatching);

    return (
      <FileBase.Chip
        opacity={0.9}
        {...props}
        bgColor={status === "unwatched" ? undefined : meta.bgColor}
        color={colors.custom.white}
        icon={meta.icon}
        label={Fmt.commas(watched)}
        denominator={Fmt.commas(total)}
      />
    );
  },
);
