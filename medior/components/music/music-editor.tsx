import {
  Button,
  Comp,
  LoadingOverlay,
  Modal,
  MusicArtistAlbums,
  MusicHero,
  MusicPlayerBar,
  MusicTracks,
  View,
} from "medior/components";
import { MusicArtist, useStores } from "medior/store";
import { colors, toast } from "medior/utils/client";

/** An album, artist, or playlist's page, which Back returns from to the page it was opened on. */
export const MusicEditor = Comp(() => {
  const stores = useStores();
  const store = stores.music.editor;

  const isBusy = store.isLoading || store.isSaving;
  // Artists with only loose tracks, such as those of a flat library, have no albums to show.
  const hasAlbums = store.item instanceof MusicArtist && store.item.albumCount > 0;

  const handleBack = async () => {
    const res = await store.goBack();
    if (!res.success) toast.error(res.error);
  };

  const handleClose = () => {
    if (!store.isSaving) store.setIsOpen(false);
  };

  const handleOpenInPlayer = async () => {
    const res = await stores.music.openInPlayer([...store.item.fileIds]);
    if (!res.success) toast.error(res.error);
  };

  const handlePlay = async () => {
    const res = await stores.music.play({ fileIds: [...store.item.fileIds] });
    if (!res.success) toast.error(res.error);
  };

  return (
    <Modal.Container isLoading={store.isSaving} onClose={handleClose} height="100%" width="100%">
      <LoadingOverlay
        isLoading={store.isLoading && !store.isSaving}
        sub={<Button text="Cancel" icon="Close" onClick={handleClose} />}
      />

      <Modal.Content dividers={false} padding={{ all: 0 }} spacing={0} overflow="hidden auto">
        <MusicHero />

        <View column spacing="1rem" padding={{ all: "0.25rem 1.5rem 1.25rem" }}>
          {hasAlbums && <MusicArtistAlbums />}

          <MusicTracks />
        </View>
      </Modal.Content>

      <MusicPlayerBar />

      <Modal.Footer>
        {store.history.length > 0 && (
          <Button text="Back" icon="ArrowBack" onClick={handleBack} disabled={isBusy} />
        )}

        <Button text="Close" icon="Close" onClick={handleClose} />

        <Button
          text="Open in Player"
          icon="OpenInNew"
          onClick={handleOpenInPlayer}
          disabled={isBusy || !store.item?.fileIds.length}
        />

        <Button
          text="Play"
          icon="PlayArrow"
          onClick={handlePlay}
          disabled={isBusy || !store.item?.fileIds.length}
          color={colors.custom.blue}
        />
      </Modal.Footer>
    </Modal.Container>
  );
});
