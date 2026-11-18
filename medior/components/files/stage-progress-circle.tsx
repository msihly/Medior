import { CenteredText, Comp, ProgressCircle, TextProps } from "medior/components";
import { colors, CssColor } from "medior/utils/client";

export interface StageProgressCircleProps {
  /** How long the media runs, shown with `time`. */
  duration?: string;
  percent: number;
  stage: string;
  stageColor?: CssColor;
  stageTooltip?: TextProps["tooltip"];
  /** Where the work is in the media; the time and duration show only with it. */
  time?: string;
}

/** The percent done in a large circle, with the current stage and, for media worked through in time, the position and length. */
export const StageProgressCircle = Comp(
  ({ duration, percent, stage, stageColor, stageTooltip, time }: StageProgressCircleProps) => (
    <ProgressCircle
      percent={percent}
      color={colors.custom.blue}
      bgColor={colors.custom.grey}
      size="13rem"
    >
      <CenteredText
        text={`${percent?.toFixed(2)}%`}
        color={colors.custom.blue}
        fontSize="1.5em"
        fontWeight={600}
      />

      {/* The reserved height keeps stages and statuses from shifting the layout, and long stages wrap within the ring's roughly 10.9rem inner width. */}
      <CenteredText
        text={stage}
        color={stageColor ?? colors.custom.lightGrey}
        fontSize="0.85em"
        overflowWrap="anywhere"
        textAlign="center"
        tooltip={stageTooltip}
        whiteSpace="normal"
        viewProps={{ maxWidth: "10rem", minHeight: "1.3em" }}
      />

      {time !== undefined && (
        <>
          <CenteredText text={time} color={colors.custom.white} />

          <CenteredText text={duration} color={colors.custom.lightGrey} />
        </>
      )}
    </ProgressCircle>
  ),
);
