import { CenteredText, Comp, ProgressCircle as ProgressCircleBase } from "medior/components";
import { FileTransform } from "medior/store";
import { colors } from "medior/utils/client";
import { dayjs } from "medior/utils/common";

export const ProgressCircle = Comp(({ transform }: { transform: FileTransform }) => (
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
));
