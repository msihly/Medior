import { Button, Comp, LoadingOverlay } from "trabecula/components";

export interface SearchLoadingOverlayProps {
  store: {
    cancelLoad: () => void;
    isLoading: boolean;
  };
}

export const SearchLoadingOverlay = Comp(({ store }: SearchLoadingOverlayProps) => (
  <LoadingOverlay
    isLoading={store.isLoading}
    sub={<Button text="Cancel Search" icon="Close" onClick={store.cancelLoad} />}
  />
));
