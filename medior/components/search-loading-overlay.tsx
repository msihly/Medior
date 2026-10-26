import { Button, Comp, LoadingOverlay } from "medior/components";

export interface SearchLoadingOverlayProps {
  isLoading?: boolean;
  onCancel?: () => void;
  store: {
    cancelLoad: () => void;
    isLoading: boolean;
    isSelecting?: boolean;
  };
}

export const SearchLoadingOverlay = Comp(
  ({ isLoading, onCancel, store }: SearchLoadingOverlayProps) => {
    const handleCancel = () => {
      if (onCancel) onCancel();
      else store.cancelLoad();
    };

    return (
      <LoadingOverlay
        isLoading={isLoading ?? (store.isLoading || store.isSelecting)}
        sub={<Button text="Cancel Search" icon="Close" onClick={handleCancel} />}
      />
    );
  },
);
