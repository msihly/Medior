import type { JobState } from "medior/server/database";
import { Button, Comp, Text, View } from "medior/components";
import { useStores } from "medior/store";
import { colors, toast } from "medior/utils/client";
import { Fmt } from "medior/utils/common";

export interface JobProgressProps {
  /** Shown in a modal that names the job and holds its buttons, so only its progress shows. */
  embedded?: boolean;
  job: JobState;
  onMinimize?: () => void;
  onRestore?: () => void;
}

export const JobProgress = Comp(({ embedded, job, onMinimize, onRestore }: JobProgressProps) => {
  return (
    <View column align="center" spacing="0.5rem">
      {!embedded && <Text preset="title">{job.label}</Text>}

      <Text>{`${Fmt.commas(job.processed)} of ${Fmt.commas(job.total)}`}</Text>

      {!!job.item && (
        <Text textAlign="center" whiteSpace="normal" overflowWrap="anywhere">
          {job.item}
        </Text>
      )}

      {!!job.message && (
        <Text color={colors.custom.lightGrey} textAlign="center" whiteSpace="normal">
          {job.stepProgress === null
            ? job.message
            : `${job.message} · ${Math.round(job.stepProgress)}%`}
        </Text>
      )}

      {!embedded && (
        <View row justify="center" spacing="0.5rem">
          <JobStopButton job={job} />

          {onMinimize && (
            <Button text="Minimize" icon="IndeterminateCheckBox" onClick={onMinimize} />
          )}

          {onRestore && <Button text="Restore" icon="OpenInFull" onClick={onRestore} />}
        </View>
      )}
    </View>
  );
});

export interface JobStopButtonProps {
  job: JobState;
}

export const JobStopButton = Comp(({ job }: JobStopButtonProps) => {
  const stores = useStores();

  const handleStop = async () => {
    const res = await stores.home.stopJob(job.id);
    if (!res.success) toast.error(res.error);
  };

  return (
    <Button
      text={job.isStopping ? "Stopping…" : "Stop"}
      icon="Stop"
      onClick={handleStop}
      disabled={job.isStopping}
      color={colors.custom.red}
    />
  );
});
