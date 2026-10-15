import { ComponentProps } from "react";
import { Comp, FileBase } from "medior/components";
import { colors, CssColor } from "medior/utils/client";
import { MEDIA_PROGRAM_WATCH_STATUSES, MediaProgramWatchStatus } from "medior/utils/common";

const WATCH_STATUS_COLORS: Record<MediaProgramWatchStatus, CssColor> = {
  dropped: colors.custom.red,
  inactive: colors.custom.orange,
  unwatched: colors.custom.grey,
  watched: colors.custom.green,
  watching: colors.custom.blue,
};

export interface WatchStatusChipProps
  extends Omit<ComponentProps<typeof FileBase.Chip>, "bgColor" | "icon" | "label"> {
  isRewatching: boolean;
  watchStatus: MediaProgramWatchStatus;
}

export const WatchStatusChip = Comp(
  ({ isRewatching, watchStatus, ...props }: WatchStatusChipProps) => {
    const label = MEDIA_PROGRAM_WATCH_STATUSES.find(({ value }) => value === watchStatus)?.label;

    return (
      <FileBase.Chip
        {...props}
        bgColor={WATCH_STATUS_COLORS[watchStatus]}
        icon={isRewatching ? "Replay" : undefined}
        label={isRewatching ? `${label} · Rewatching` : label}
      />
    );
  },
);
