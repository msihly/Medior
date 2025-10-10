import { Fragment } from "react";
import { Button, Comp, ConfirmModal } from "medior/components";
import { Ingester, Reingester } from "medior/store";
import { colors } from "medior/utils/client";

export interface CancelButtonProps {
  store: Ingester | Reingester;
}

export const CancelButton = Comp(({ store }: CancelButtonProps) => {
  const confirmDiscard = async () => {
    store.setIsOpen(false);
    return true;
  };

  const handleCancel = () => store.setIsConfirmDiscardOpen(true);

  return (
    <Fragment>
      <Button
        text="Cancel"
        icon="Delete"
        onClick={handleCancel}
        disabled={store.isDisabled}
        colorOnHover={colors.custom.red}
      />

      {store.isConfirmDiscardOpen && (
        <ConfirmModal
          headerText="Discard Changes"
          subText="Are you sure you want to cancel importing?"
          setVisible={store.setIsConfirmDiscardOpen}
          onConfirm={confirmDiscard}
        />
      )}
    </Fragment>
  );
});
