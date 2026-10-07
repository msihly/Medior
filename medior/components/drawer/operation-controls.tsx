import { useState } from "react";
import { BackgroundOperationSchema } from "medior/_generated/server";
import { Button, Comp, ConfirmModal } from "medior/components";
import { useStores } from "medior/store";
import { toast } from "medior/utils/client";
import { trpc } from "medior/utils/server";

export const OperationControls = Comp(({ operation }: { operation: BackgroundOperationSchema }) => {
  const stores = useStores();
  const store = stores.home;

  const [isConfirmRemoveOpen, setIsConfirmRemoveOpen] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  const confirmRemove = async () => {
    setIsRemoving(true);

    try {
      const result = await trpc.deleteFileTransforms.mutate({
        ids: operation.failures.map((failure) => failure.targetId),
        retainMedia: true,
      });

      if (!result.success) throw new Error(result.error);

      setIsConfirmRemoveOpen(false);
      await store.loadBackgroundActivity();

      return true;
    } catch (error) {
      toast.error(error.message);

      return false;
    } finally {
      setIsRemoving(false);
    }
  };

  const handleCancel = () => store.cancelBackgroundOperation(operation.id);

  const handleDismiss = async () => {
    const result = await trpc.dismissBackgroundOperation.mutate({ id: operation.id });

    if (!result.success) return toast.error(result.error);

    store.updateBackgroundOperation(result.data);
    await store.loadBackgroundActivity();
  };

  const handleRemove = () => setIsConfirmRemoveOpen(true);

  const handleRetry = async () => {
    setIsRetrying(true);

    try {
      const result = await store.retryBackgroundOperation(operation.id);

      if (!result.success) toast.error(result.error);
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <>
      {operation.type === "duplicateMerge" &&
        !!operation.failures?.length &&
        ["CANCELLED", "ERROR"].includes(operation.status) && (
          <Button disabled={isRemoving} text="Remove Failed Records" onClick={handleRemove} />
        )}

      {isConfirmRemoveOpen && (
        <ConfirmModal
          headerText="Remove Failed Transform Records"
          onConfirm={confirmRemove}
          setVisible={setIsConfirmRemoveOpen}
          subText={`Remove ${operation.failures.length} failed transform records, pending recovery records and outstanding merge tasks? Media files and file metadata will not be deleted.`}
        />
      )}

      {operation.type !== "repair" &&
        (!!operation.targetIds.length ||
          [
            "importEntryMigration",
            "mediaPathIndex",
            "metadataAction",
            "persistenceMigration",
            "transformQueue",
          ].includes(operation.type)) &&
        ["CANCELLED", "ERROR"].includes(operation.status) && (
          <Button
            text={isRetrying ? "Retrying…" : "Retry"}
            disabled={isRetrying}
            onClick={handleRetry}
          />
        )}

      {(["PENDING", "RUNNING"].includes(operation.status) ||
        (operation.type === "repair" && operation.status === "ERROR")) && (
        <Button
          text={operation.status === "ERROR" ? "Cancel Remaining Work" : "Cancel"}
          onClick={handleCancel}
        />
      )}

      {["CANCELLED", "COMPLETE", "ERROR"].includes(operation.status) &&
        (!["importEntryMigration", "persistenceMigration"].includes(operation.type) ||
          operation.status === "COMPLETE") && (
          <Button text="Dismiss" icon="Close" disabled={isRetrying} onClick={handleDismiss} />
        )}
    </>
  );
});
