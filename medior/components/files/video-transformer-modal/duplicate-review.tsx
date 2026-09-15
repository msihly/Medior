import { shell } from "@electron/remote";
import { MouseEvent, useState } from "react";
import { Button, Comp, Detail, Modal, Text, View } from "medior/components";
import { FileTransform, useStores } from "medior/store";
import { toast } from "medior/utils/client";
import { trpc } from "medior/utils/server";
import { ComparisonViewer } from "./comparison-viewer";

export const DuplicateReview = Comp(({ transform }: { transform: FileTransform }) => {
  const stores = useStores();
  const store = stores.file.videoTransformer;
  const [isComparing, setIsComparing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const closeComparison = () => setIsComparing(false);

  const closeReview = () => {
    setIsComparing(false);
    setIsOpen(false);
  };

  const handleInteraction = (event: MouseEvent) => event.stopPropagation();

  const openComparison = () => setIsComparing(true);

  const openFile = async (path: string) => {
    const error = await shell.openPath(path);
    if (error) toast.error(error);
  };

  const openMatch = () => openFile(transform.duplicatePath);

  const openOriginal = () => openFile(transform.beforePath);

  const inspectOutputHash = async (event: MouseEvent) => {
    event.stopPropagation();
    setIsLoading(true);
    try {
      const res = await trpc.inspectFileTransformDuplicate.mutate({ id: transform.id });
      if (!res.success) return toast.error(res.error);
      if (!res.data) return toast.info("No other file currently has the recorded output hash.");
      transform.update(res.data);
      setIsOpen(true);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const openReview = (event: MouseEvent) => {
    event.stopPropagation();
    if (transform.duplicateFileId) setIsOpen(true);
    else return inspectOutputHash(event);
  };

  const mergeDuplicate = async () => {
    setIsLoading(true);
    try {
      const res = await trpc.mergeFileTransformDuplicate.mutate({ id: transform.id });
      if (!res.success) throw new Error(res.error);
      closeReview();
      await store.loadQueue({ noCache: true, withFullCount: true });
      await store.loadQueueCount();
      toast.success("Metadata and collections merged; original archived.");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return !transform.duplicateFileId ? null : (
    <>
      <Button
        text="Review Duplicate"
        icon="Compare"
        onClick={openReview}
        loading={isLoading}
        disabled={isLoading}
      />

      {isOpen && (
        <Modal.Container
          onClose={closeReview}
          onClick={handleInteraction}
          onDoubleClick={handleInteraction}
          width="60rem"
        >
          <Modal.Header>
            <Text preset="title">{"Duplicate Output"}</Text>
          </Modal.Header>

          <Modal.Content>
            <Text>
              {
                "The re-encoded output matched an existing file's recorded MD5. The original was retained."
              }
            </Text>

            {[
              ["Original file ID", transform.fileId],
              ["Original path", transform.beforePath],
              ["Original MD5", transform.beforeHash],
              ["Matched file ID", transform.duplicateFileId],
              ["Matched path", transform.duplicatePath],
              ["Output / matched MD5", transform.afterHash],
              ["Output path", transform.afterPath],
            ].map(([label, value]) => (
              <Detail
                key={label}
                label={label}
                value={
                  <Text style={{ overflowWrap: "anywhere", userSelect: "text" }}>
                    {value || "--"}
                  </Text>
                }
              />
            ))}

            <View row spacing="0.5rem">
              <Button
                text="Recheck Match"
                icon="Refresh"
                onClick={inspectOutputHash}
                loading={isLoading}
                disabled={isLoading || transform.status === "MERGED"}
              />

              <Button text="Open Original" icon="OpenInNew" onClick={openOriginal} />

              <Button text="Open Match" icon="OpenInNew" onClick={openMatch} />

              <Button text="Compare Original / Match" icon="Compare" onClick={openComparison} />
            </View>
          </Modal.Content>

          <Modal.Footer>
            <Button
              text="Merge & Archive Original"
              icon="Archive"
              onClick={mergeDuplicate}
              disabled={isLoading || store.isTransforming || transform.status === "MERGED"}
              loading={isLoading}
            />

            <Button text="Close" icon="Close" onClick={closeReview} />
          </Modal.Footer>

          {isComparing && (
            <ComparisonViewer
              onClose={closeComparison}
              outputLabel="Existing Match"
              outputPath={transform.duplicatePath}
              transform={transform}
            />
          )}
        </Modal.Container>
      )}
    </>
  );
});
