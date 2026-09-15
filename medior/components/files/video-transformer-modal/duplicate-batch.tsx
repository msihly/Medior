import { useRef, useState } from "react";
import { Button, Card, Comp, Dropdown, Modal, Text, TextProps } from "medior/components";
import { useStores } from "medior/store";
import { toast } from "medior/utils/client";
import { trpc } from "medior/utils/server";

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
  const [scope, setScope] = useState("filtered");
  const [progress, setProgress] = useState("");
  const [failures, setFailures] = useState<string[]>([]);

  const open = () => {
    setScope(store.search.selectedIds.length ? "selected" : "filtered");
    setIsOpen(true);
  };
  const close = () => {
    if (!isRunning) setIsOpen(false);
  };
  const stop = () => {
    cancelled.current = true;
  };

  const merge = async () => {
    cancelled.current = false;
    setIsRunning(true);
    setFailures([]);
    setProgress("Finding duplicates in the chosen scope...");
    try {
      const candidates = await trpc.listFileTransformDuplicates.mutate({
        filter: store.search.cachedFilterProps ?? store.search.getFilterProps(),
        ...(scope === "selected"
          ? { ids: [...store.search.selectedIds] }
          : store.search.forcePages
            ? { ids: [...store.search.ids] }
            : {}),
      });
      if (!candidates.success) throw new Error(candidates.error);
      let completed = 0;
      let failed = 0;
      for (const id of candidates.data) {
        if (cancelled.current) break;
        try {
          const res = await trpc.mergeFileTransformDuplicate.mutate({ id });
          if (!res.success) throw new Error(res.error);
          completed++;
        } catch (error) {
          failed++;
          setFailures((previous) => [...previous, `${id}: ${error.message}`]);
        }
        setProgress(
          `${completed + failed} / ${candidates.data.length} checked; ${completed} merged; ${failed} need attention.`,
        );
      }
      if (!candidates.data.length) setProgress("No duplicates in this scope.");
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

  const actionsDisabled =
    isRunning || store.isTransforming || (scope === "selected" && !store.search.selectedIds.length);

  return (
    <>
      <Button text="Duplicates" icon="Compare" onClick={open} />

      {isOpen && (
        <Modal.Container onClose={close} width="42rem">
          <Modal.Header>
            <Text preset="title">{"Merge Duplicates"}</Text>
          </Modal.Header>

          <Modal.Content minWidth={0} height="auto" spacing="0.75rem" padding={{ all: "1rem" }}>
            <Dropdown
              header="Scope"
              value={scope}
              setValue={setScope}
              disabled={isRunning}
              options={[
                { label: "Duplicates in current search (all pages)", value: "filtered" },
                { label: "Selected duplicates", value: "selected" },
              ]}
            />

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

            {failures.map((failure) => (
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
