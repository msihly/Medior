import { Comp, StageProgressCircle } from "medior/components";
import { FileTransform } from "medior/store";
import { dayjs } from "medior/utils/common";
import { getTransformStatusDisplay } from "./file-details";

export const TransformProgressCircle = Comp(({ transform }: { transform: FileTransform }) => {
  const isRunning = transform.status === "RUNNING";
  const status = isRunning ? null : getTransformStatusDisplay(transform);

  return (
    <StageProgressCircle
      percent={transform.progress.percent}
      stage={(isRunning ? transform.progressStage : status?.label) ?? ""}
      stageColor={status?.color}
      stageTooltip={status ? transform.errorMsg : undefined}
      time={transform.isAnimated ? transform.progress.time || "--" : undefined}
      duration={
        transform.beforeDuration
          ? dayjs.duration(transform.beforeDuration, "s").format("HH:mm:ss.SSS").substring(0, 11)
          : "--"
      }
    />
  );
});
