import { useRef, useState } from "react";
import { SocketEvents } from "medior/_generated/server/socket";
import { Button, Card, Comp, Modal, Text, TextProps } from "medior/components";
import { useStores } from "medior/store";
import { toast } from "medior/utils/client";
import { chunkArray, CONSTANTS } from "medior/utils/common";
import { socket, trpc } from "medior/utils/server";

const descriptionProps: TextProps = {
  fontSize: "0.9em",
  fontWeight: 400,
  lineHeight: 1.5,
  overflow: "visible",
  whiteSpace: "normal",
};

export const DuplicateBatch = Comp(() => {
  const stores = useStores();
  const store = stores.file.videoTransformer;
  const cancelled = useRef(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [failures, setFailures] = useState<string[]>([]);

  const open = () => {
    setIsOpen(true);
  };
  const close = () => {
    if (!isRunning) setIsOpen(false);
  };
  const stop = async () => {
    cancelled.current = true;
    setProgress("Stopping after the current file and finishing metadata updates...");
    const res = await trpc.cancelFileTransformDuplicateMerge.mutate();
    if (!res.success) toast.error(res.error);
  };

  const merge = async () => {
    cancelled.current = false;
    setIsRunning(true);
    setFailures([]);
    setProgress("Finding all completed duplicates...");
    try {
      const candidates = await trpc.listFileTransformDuplicates.mutate();
      if (!candidates.success) throw new Error(candidates.error);
      setProgress(`Found ${candidates.data.length} duplicates. Starting merge...`);
      let completed = 0;
      let failed = 0;
      for (const ids of chunkArray(candidates.data, CONSTANTS.FILE.TRANSFORM.BATCH_SIZE)) {
        if (cancelled.current) break;
        const onProgress = (args: Parameters<SocketEvents["onDuplicateMergeProgress"]>[0]) => {
          if (args.batchId !== ids[0]) return;
          setProgress(
            `${completed + failed + args.completed + args.failed} / ${candidates.data.length} checked; ${completed + args.completed} merged; ${failed + args.failed} need attention.${args.isRegenerating ? " Updating batch metadata..." : ""}`,
          );
        };
        socket.on("onDuplicateMergeProgress", onProgress);
        try {
          const res = await trpc.mergeFileTransformDuplicate.mutate({ ids });
          if (!res.success) throw new Error(res.error);
          completed += res.data.completed;
          failed += res.data.failures.length;
          setFailures((previous) => [...previous, ...res.data.failures]);
          setProgress(
            `${completed + failed} / ${candidates.data.length} checked; ${completed} merged; ${failed} need attention.`,
          );
        } finally {
          socket.off("onDuplicateMergeProgress", onProgress);
        }
      }
      if (!candidates.data.length) setProgress("No completed duplicates found.");
      if (cancelled.current) setProgress((previous) => `Stopped. ${previous}`);
      await store.loadQueue({ noCache: true, withFullCount: true });
      await store.loadQueueCount();
      await store.loadActiveTransform();
    } catch (error) {
      toast.error(error.message);
      setProgress(error.message);
    } finally {
      setIsRunning(false);
    }
  };

  const actionsDisabled = isRunning || store.isTransforming;

  return (
    <>
      <Button text="Duplicates" icon="Compare" onClick={open} />

      {isOpen && (
        <Modal.Container onClose={close} width="42rem">
          <Modal.Header>
            <Text preset="title">{"Merge Duplicates"}</Text>
          </Modal.Header>

          <Modal.Content minWidth={0} height="auto" spacing="0.75rem" padding={{ all: "1rem" }}>
            <Text {...descriptionProps}>
              {
                "Merge all completed duplicates, regardless of the current search. New duplicates are merged automatically during processing."
              }
            </Text>

            <Card
              flex="none"
              width="100%"
              minWidth={0}
              maxWidth="100%"
              spacing="0.75rem"
              padding={{ all: "0.75rem" }}
            >
              <Text {...descriptionProps}>
                {
                  "Verify matching output hashes, then combine tags, keep the higher rating, fill missing names, diffusion parameters and transcripts, and combine timestamps."
                }
              </Text>

              <Text {...descriptionProps}>
                {
                  "Collection entries move to the matched file. The original is archived with its file and metadata retained. Conflicting metadata on the matched file is kept."
                }
              </Text>

              <Button
                text="Merge & Archive Originals"
                icon="Archive"
                onClick={merge}
                disabled={actionsDisabled}
                width="100%"
              />
            </Card>

            {store.isTransforming && (
              <Text {...descriptionProps}>
                {"Pause media processing and wait for the current file to finish first."}
              </Text>
            )}

            {progress && <Text {...descriptionProps}>{progress}</Text>}

            {failures.length > 100 && (
              <Text
                {...descriptionProps}
              >{`Showing the latest 100 of ${failures.length} errors.`}</Text>
            )}

            {failures.slice(-100).map((failure) => (
              <Text
                {...descriptionProps}
                key={failure}
                overflowWrap="anywhere"
                style={{ userSelect: "text" }}
              >
                {failure}
              </Text>
            ))}
          </Modal.Content>

          <Modal.Footer>
            {isRunning ? (
              <Button text="Stop After Current File" icon="Stop" onClick={stop} />
            ) : (
              <Button text="Close" icon="Close" onClick={close} />
            )}
          </Modal.Footer>
        </Modal.Container>
      )}
    </>
  );
});
