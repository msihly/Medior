import { useEffect, useRef } from "react";
import { Button, Card, Comp, Modal, StageProgressCircle, Text } from "medior/components";
import { useStores } from "medior/store";
import { toast } from "medior/utils/client";
import { Fmt, formatCaptionSegments } from "medior/utils/common";

/** The running transcription's progress, with the current file's transcript as its segments come in. */
export const FileTranscriptionModal = Comp(() => {
  const stores = useStores();
  const store = stores.file;

  const transcriptRef = useRef<HTMLDivElement>(null);

  const job = store.transcriptionJob;
  const transcript = stores.home.getJobTranscript(store.transcriptionJobId);
  const segmentCount = transcript?.length ?? 0;

  // The transcript keeps its newest segment in view.
  useEffect(() => {
    transcriptRef.current?.scrollTo({
      behavior: "instant",
      top: transcriptRef.current.scrollHeight,
    });
  }, [segmentCount]);

  const handleCancel = async () => {
    if (!job) store.setIsTranscriptionOpen(false);
    else {
      const res = await stores.home.stopJob(job.id);
      if (!res.success) toast.error(res.error);
    }
  };

  const handleMinimize = () => store.setIsTranscriptionMinimized(true);

  return (
    <Modal.Container
      width="40rem"
      visible={!store.isTranscriptionMinimized}
      onClose={handleMinimize}
    >
      <Modal.Header>
        <Text preset="title">{"Transcribe Files"}</Text>
      </Modal.Header>

      <Modal.Content align="center" justify="center" spacing="1rem">
        <StageProgressCircle
          percent={job?.stepProgress ?? 0}
          stage={job?.message ?? ""}
          time={job?.itemTime ? Fmt.duration(job.itemTime.position) : undefined}
          duration={job?.itemTime ? Fmt.duration(job.itemTime.duration) : undefined}
        />

        {!!job?.item && (
          <Text textAlign="center" whiteSpace="normal" overflowWrap="anywhere">
            {job.item}
          </Text>
        )}

        {segmentCount > 0 && (
          <Card ref={transcriptRef} height="15rem" overflow="auto" width="100%">
            <Text flexShrink={0} whiteSpace="pre-wrap">
              {formatCaptionSegments(transcript)}
            </Text>
          </Card>
        )}
      </Modal.Content>

      <Modal.Footer>
        <Button
          text={job?.isStopping ? "Stopping…" : "Cancel"}
          icon="Close"
          onClick={handleCancel}
          disabled={job?.isStopping}
        />

        <Button text="Minimize" icon="IndeterminateCheckBox" onClick={handleMinimize} />
      </Modal.Footer>
    </Modal.Container>
  );
});
