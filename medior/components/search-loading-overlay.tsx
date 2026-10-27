import { Button, Chip, Comp, LoadingOverlay, ProgressBar, Text, View } from "medior/components";
import { Fmt, round, TaskProgress } from "medior/utils/common";

export interface SearchLoadingOverlayProps {
  isLoading?: boolean;
  onCancel?: () => void;
  progress?: TaskProgress | null;
  store: {
    cancelLoad: () => void;
    isLoading: boolean;
    isSelecting?: boolean;
  };
}

export const SearchLoadingOverlay = Comp(
  ({ isLoading, onCancel, progress, store }: SearchLoadingOverlayProps) => {
    const handleCancel = () => {
      if (onCancel) onCancel();
      else store.cancelLoad();
    };

    return (
      <LoadingOverlay
        isLoading={isLoading ?? (store.isLoading || store.isSelecting)}
        sub={
          <View column align="center" spacing="1rem">
            {progress && (
              <View column align="center" spacing="0.5rem" width="24rem">
                <Text textAlign="center">{progress.message}</Text>

                <View row align="center" justify="center" spacing="0.5rem" width="100%">
                  {progress.elapsed != null && (
                    <Chip label={Fmt.duration(progress.elapsed)} icon="Timer" />
                  )}

                  {progress.progress != null && (
                    <ProgressBar numerator={round(progress.progress)} denominator={100} />
                  )}
                </View>
              </View>
            )}

            <Button text="Cancel Search" icon="Close" onClick={handleCancel} />
          </View>
        }
      />
    );
  },
);
