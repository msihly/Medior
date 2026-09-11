import { Button, Comp, LoadingOverlay } from "trabecula/components";

export interface SearchLoadingOverlayProps {
  isLoading?: boolean;
  onCancel?: () => void;
  store: {
    cancelLoad: () => void;
    isLoading: boolean;
  };
}

export const SearchLoadingOverlay = Comp(
  ({ isLoading, onCancel, store }: SearchLoadingOverlayProps) => {
    const handleCancel = () => (onCancel ? onCancel() : store.cancelLoad());

    return (
      <LoadingOverlay
        isLoading={isLoading ?? store.isLoading}
        sub={<Button text="Cancel Search" icon="Close" onClick={handleCancel} />}
      />
    );
  },
);
