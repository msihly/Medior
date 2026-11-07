import {
  Button,
  Comp,
  LoadingOverlay,
  MediaProgramAbout,
  MediaProgramEpisodes,
  MediaProgramHero,
  MediaProgramSeasons,
  Modal,
  View,
} from "medior/components";
import { useStores } from "medior/store";
import { colors, toast } from "medior/utils/client";

/** A program's title page, where each of its details is edited where it's shown. */
export const MediaProgramEditor = Comp(() => {
  const stores = useStores();
  const store = stores.mediaProgram.editor;

  const program = store.program;
  const isBusy = store.isLoading || store.isSaving;

  const handleClose = () => {
    if (!store.isSaving) store.setIsOpen(false);
  };

  const handlePlay = async () => {
    const res = await store.play();
    if (!res.success) toast.error(res.error);
  };

  return (
    <Modal.Container isLoading={store.isSaving} onClose={handleClose} height="100%" width="100%">
      <LoadingOverlay
        isLoading={store.isLoading && !store.isSaving}
        sub={<Button text="Cancel" icon="Close" onClick={handleClose} />}
      />

      <Modal.Content dividers={false} padding={{ all: 0 }} spacing={0} overflow="hidden auto">
        <MediaProgramHero />

        <View row align="flex-start" spacing="1.25rem" padding={{ all: "0.25rem 1.5rem 1.25rem" }}>
          <MediaProgramAbout />

          <View column flex={1} minWidth={0} spacing="1rem">
            <MediaProgramSeasons />

            <MediaProgramEpisodes />
          </View>
        </View>
      </Modal.Content>

      <Modal.Footer>
        <Button text="Close" icon="Close" onClick={handleClose} />

        <Button
          text={program?.watchedIdSet.size > 0 ? "Continue" : "Play"}
          icon="PlayArrow"
          onClick={handlePlay}
          disabled={isBusy || !store.episodeIds.length}
          color={colors.custom.blue}
        />
      </Modal.Footer>
    </Modal.Container>
  );
});
