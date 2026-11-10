import { ipcRenderer } from "electron";
import autoBind from "auto-bind";
import { reaction } from "mobx";
import { Model, model, modelFlow, prop } from "mobx-keystone";
import { FileSchema } from "medior/server/database";
import { RootStore } from "medior/store";
import { asyncAction, openWithPlayer, toast, writePlaylist } from "medior/utils/client";
import { chunkArray, getMusicCountLabel, getMusicTrackTitle } from "medior/utils/common";
import { getConfig, rpc } from "medior/utils/server";
import { MusicEditorStore, MusicManagerStore, MusicPlayback, MusicPlayerStore } from ".";

@model("medior/MusicStore")
export class MusicStore extends Model({
  editor: prop<MusicEditorStore>(() => new MusicEditorStore({})),
  /** Playlists waiting for their deletion to be confirmed. */
  idsForConfirmDelete: prop<string[]>(() => []).withSetter(),
  manager: prop<MusicManagerStore>(() => new MusicManagerStore({})),
  player: prop<MusicPlayerStore>(() => new MusicPlayerStore({})),
  /** Files being added to a playlist chosen in the playlist picker, which shows while set. */
  playlistPickerFileIds: prop<string[]>(() => []).withSetter(),
}) {
  onAttachedToRootStore(stores: RootStore) {
    // Leaving the music view while a track plays, or loads to play, moves it into the compact
    // player window.
    return reaction(
      () => stores.home.view === "music",
      (isShown) => {
        if (!isShown && this.player.isActive) this.player.popOut();
      },
    );
  }

  onInit() {
    autoBind(this);
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  /** Adds the audio and video files among them that the playlist doesn't have to its end. */
  @modelFlow
  addFilesToPlaylist = asyncAction(async ({ fileIds, id }: { fileIds: string[]; id: string }) => {
    const res = await rpc.addFilesToMusicPlaylist({ fileIds, id });
    if (!res.success) throw new Error(res.error);

    const { addedCount, playlist } = res.data;

    if (addedCount)
      toast.success(`Added ${getMusicCountLabel(addedCount, "track")} to ${playlist.name}`);
    else toast.warn(`${playlist.name} already has these files, or none of them are audio or video`);

    return playlist;
  });

  @modelFlow
  createPlaylist = asyncAction(async ({ fileIds, name }: { fileIds?: string[]; name: string }) => {
    const res = await rpc.createMusicPlaylist({ fileIds, name });
    if (!res.success) throw new Error(res.error);

    toast.success(`Created ${res.data.name}`);

    return res.data;
  });

  @modelFlow
  deletePlaylists = asyncAction(async (ids: string[]) => {
    const res = await rpc.deleteMusicPlaylists({ ids });
    if (!res.success) throw new Error(res.error);

    const search = this.manager.playlists;

    search.setSelectedIds(search.selectedIds.filter((id) => !ids.includes(id)));

    if (this.editor.isPlaylist && ids.includes(this.editor.item?.id)) this.editor.setIsOpen(false);

    toast.success(`Deleted ${getMusicCountLabel(ids.length, "playlist")}`);
  });

  /** Creates a playlist from each M3U file, with the tracks the library has at its paths. */
  @modelFlow
  importPlaylists = asyncAction(async (filePaths: string[]) => {
    const res = await rpc.importMusicPlaylists({ filePaths });
    if (!res.success) throw new Error(res.error);

    const { createdCount, missingCount } = res.data;

    toast.success(`Imported ${getMusicCountLabel(createdCount, "playlist")}`);

    if (missingCount)
      toast.warn(`Left out ${getMusicCountLabel(missingCount, "track")} the library doesn't have`);
  });

  /** Opens the tracks in order in Settings' music player, through Medior's playlist file. */
  @modelFlow
  openInPlayer = asyncAction(async (fileIds: string[]) => {
    if (!fileIds.length) throw new Error("There are no tracks to play.");

    const files = new Map<string, FileSchema>();

    for (const ids of chunkArray(fileIds, 1000)) {
      const res = await rpc.listFile({
        args: { filter: { id: ids }, page: 1, pageSize: ids.length },
      });
      if (!res.success) throw new Error(res.error);

      for (const file of res.data.items) files.set(file.id, file);
    }

    const playlistPath = await writePlaylist(
      fileIds
        .map((fileId) => files.get(fileId))
        .filter(Boolean)
        .map((file) => ({
          duration: file.duration,
          path: file.path,
          title: file.music
            ? `${file.music.artists.map((artist) => artist.name).join(", ")} - ${getMusicTrackTitle(file)}`
            : file.originalName,
        })),
    );

    await openWithPlayer(playlistPath, getConfig().music.player);
  });

  /**
   * Plays every track in order, starting from the given or first track: in the compact player
   * window while it's open, or else in the music view's player.
   */
  @modelFlow
  play = asyncAction(async ({ fileId, fileIds }: { fileId?: string; fileIds: string[] }) => {
    if (!fileIds.length) throw new Error("There are no tracks to play.");

    // The compact player window keeps its own volume.
    const playback: MusicPlayback = {
      fileIds: [...fileIds],
      index: Math.max(0, fileIds.indexOf(fileId)),
      isPlaying: true,
      time: 0,
    };

    // Playing there stops this window's player, so only one plays.
    if (await ipcRenderer.invoke("playInMusicPlayerWindow", playback)) this.player.stop();
    else {
      const res = await this.player.playQueue({ fileId, fileIds });
      if (!res.success) throw new Error(res.error);
    }
  });

  @modelFlow
  renamePlaylist = asyncAction(async ({ id, name }: { id: string; name: string }) => {
    const res = await rpc.updateMusicPlaylist({ id, updates: { name } });
    if (!res.success) throw new Error(res.error);

    this.manager.playlists.getResult(id)?.update(res.data);

    if (this.editor.isPlaylist && this.editor.item?.id === id) this.editor.updateItem(res.data);
  });
}
