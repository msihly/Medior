import { ipcRenderer } from "electron";
import { useEffect } from "react";
import {
  CenteredText,
  Comp,
  MusicCompactPlayer,
  MusicPlayerAudio,
  View,
  WindowTitleBar,
} from "medior/components";
import { MusicPlayback, useStores } from "medior/store";
import { toast } from "medior/utils/client";
import { getMusicTrackTitle } from "medior/utils/common";

/** The compact player window, which plays the queues the music view pops out or sends to it. */
export const MusicPlayerWindow = Comp(() => {
  const stores = useStores();
  const store = stores.music.player;

  const title = store.file ? `${getMusicTrackTitle(store.file)} — Medior` : "Medior";

  useEffect(() => {
    const handlePlayback = async (_, playback: MusicPlayback) => {
      const res = await store.resume(playback);
      if (!res.success) toast.error(res.error);
    };

    // Queues sent while the window loaded wait for this, so none arrive before it listens.
    ipcRenderer.on("init", handlePlayback);
    ipcRenderer.send("musicPlayerReady");

    return () => {
      ipcRenderer.removeListener("init", handlePlayback);
    };
  }, []);

  return (
    <View column height="100vh" overflow="hidden">
      <WindowTitleBar isDark title={title} bgColor={store.coverTheme?.header} />

      <MusicPlayerAudio />

      {store.file ? <MusicCompactPlayer /> : <CenteredText text="Nothing playing" />}
    </View>
  );
});
