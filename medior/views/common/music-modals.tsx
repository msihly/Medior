import { ipcRenderer } from "electron";
import { SetStateAction, useEffect } from "react";
import {
  Comp,
  ConfirmModal,
  MusicEditor,
  MusicPlayerAudio,
  MusicPlaylistPickerModal,
} from "medior/components";
import { MusicPlayback, useStores } from "medior/store";
import { toast } from "medior/utils/client";
import { getMusicCountLabel } from "medior/utils/common";

export const MusicModals = Comp(() => {
  const stores = useStores();
  const store = stores.music;

  const deleteCount = store.idsForConfirmDelete.length;

  // The compact player docks its queue back here, in the music view, which shows to play it.
  useEffect(() => {
    const handleDock = async (_, playback: MusicPlayback) => {
      stores.home.openView("music");

      const res = await store.player.resume(playback);
      if (!res.success) toast.error(res.error);
    };

    ipcRenderer.on("dockMusicPlayer", handleDock);

    return () => {
      ipcRenderer.removeListener("dockMusicPlayer", handleDock);
    };
  }, []);

  const handleDelete = async () => {
    const res = await store.deletePlaylists([...store.idsForConfirmDelete]);
    if (!res.success) toast.error(res.error);

    return res.success;
  };

  const handleDeleteVisible = (isVisible: SetStateAction<boolean>) => {
    if (!isVisible) store.setIdsForConfirmDelete([]);
  };

  return (
    <>
      {/* The music view's player plays here, so switching between its pages never stops it. */}
      <MusicPlayerAudio />

      {store.editor.isOpen && <MusicEditor />}

      {store.playlistPickerFileIds.length > 0 && <MusicPlaylistPickerModal />}

      {deleteCount > 0 && (
        <ConfirmModal
          headerText="Delete Playlists"
          subText={`Delete ${getMusicCountLabel(deleteCount, "playlist")}? Their files stay in your library.`}
          setVisible={handleDeleteVisible}
          onConfirm={handleDelete}
        />
      )}
    </>
  );
});
