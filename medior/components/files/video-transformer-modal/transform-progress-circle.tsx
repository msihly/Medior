import { CenteredText, Comp, ProgressCircle as ProgressCircleBase } from "medior/components";
import { FileTransform } from "medior/store";
import { colors } from "medior/utils/client";
import { dayjs } from "medior/utils/common";
import { getTransformStatusDisplay } from "./file-details";

export const ProgressCircle = Comp(({ transform }: { transform: FileTransform }) => {
  const isRunning = transform.status === "RUNNING";
  const status = isRunning ? null : getTransformStatusDisplay(transform);

  return (
    <ProgressCircleBase
      percent={transform.progress.percent}
      color={colors.custom.blue}
      bgColor={colors.custom.grey}
      size="13rem"
    >
      <CenteredText
        text={`${transform.progress.percent?.toFixed(2)}%`}
        color={colors.custom.blue}
        fontSize="1.5em"
        fontWeight={600}
      />

      {/* The reserved height keeps stages and statuses from shifting the layout. */}
      <CenteredText
        text={(isRunning ? transform.progressStage : status?.label) ?? ""}
        color={status?.color ?? colors.custom.lightGrey}
        fontSize="0.85em"
        tooltip={status ? transform.errorMsg : undefined}
        viewProps={{ minHeight: "1.3em" }}
      />

      {transform.isAnimated && (
        <>
          <CenteredText text={transform.progress.time || "--"} color={colors.custom.white} />

          <CenteredText
            text={
              transform.beforeDuration
                ? dayjs
                    .duration(transform.beforeDuration, "s")
                    .format("HH:mm:ss.SSS")
                    .substring(0, 11)
                : "--"
            }
            color={colors.custom.lightGrey}
          />
        </>
      )}
    </ProgressCircleBase>
  );
});
