import autoBind from "auto-bind";
import { computed } from "mobx";
import { Model, model, modelAction, ModelCreationData, modelFlow, prop } from "mobx-keystone";
import { File, FileSearch } from "medior/store";
import { asyncAction, derefMobx, loadFilesWithTags } from "medior/utils/client";
import { isDeepEqual, moveMusicTracks } from "medior/utils/common";
import { rpc } from "medior/utils/server";
import { MusicAlbum, MusicAlbumSearch, MusicArtist, MusicPlaylist } from ".";

export type MusicItemKind = "album" | "artist" | "playlist";

export type MusicItemTarget = { id: string; kind: MusicItemKind };

/** An album, artist, or playlist's page, with its tracks and, for an artist, their albums. */
@model("medior/MusicEditorStore")
export class MusicEditorStore extends Model({
  /** The artist's albums, shown on their page. */
  albumSearch: prop<MusicAlbumSearch>(() => new MusicAlbumSearch({})),
  /** The file whose cover art or thumbnail the page shows. */
  cover: prop<File>(null).withSetter(),
  /** The pages opened before this one, such as an artist's before one of their albums. */
  history: prop<MusicItemTarget[]>(() => []).withSetter(),
  isLoading: prop<boolean>(false).withSetter(),
  isOpen: prop<boolean>(false),
  isSaving: prop<boolean>(false).withSetter(),
  item: prop<MusicAlbum | MusicArtist | MusicPlaylist>(null).withSetter(),
  kind: prop<MusicItemKind>(null).withSetter(),
  search: prop<FileSearch>(() => new FileSearch({})),
}) {
  private loadRevision = 0;

  onInit() {
    autoBind(this);
  }

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  cancelLoad() {
    this.loadRevision++;
    this.isLoading = false;
    this.albumSearch.cancelLoad();
    this.search.cancelLoad();
  }

  @modelAction
  setIsOpen(isOpen: boolean) {
    this.cancelLoad();
    this.isOpen = isOpen;

    if (!isOpen) {
      this.cover = null;
      this.history = [];
      this.item = null;
      this.kind = null;
    }

    this.albumSearch.reset();
    this.search.reset();
  }

  @modelAction
  updateItem(updates: Partial<ModelCreationData<MusicAlbum & MusicArtist & MusicPlaylist>>) {
    this.item?.update(updates);
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  /** Returns to the page opened before this one. */
  @modelFlow
  goBack = asyncAction(async () => {
    const history: MusicItemTarget[] = derefMobx(this.history);
    const previous = history.at(-1);

    if (!previous) return;

    this.setHistory(history.slice(0, -1));

    const res = await this.loadItem(previous);
    if (!res.success) throw new Error(res.error);
  });

  /** Loads the page's cover file, keeping one already loaded. */
  @modelFlow
  loadCover = asyncAction(async () => {
    const coverFileId = this.item?.coverFileId;

    if (!coverFileId) this.setCover(null);
    else if (this.cover?.id !== coverFileId) {
      const [file] = await loadFilesWithTags([coverFileId]);

      if (this.item?.coverFileId === coverFileId) this.setCover(file ? new File(file) : null);
    }
  });

  @modelFlow
  loadItem = asyncAction(async ({ id, kind }: MusicItemTarget) => {
    this.cancelLoad();

    const revision = this.loadRevision;

    this.setIsLoading(true);

    try {
      const args = { args: { filter: { id } } };
      const res =
        kind === "album"
          ? await rpc.listMusicAlbum(args)
          : kind === "artist"
            ? await rpc.listMusicArtist(args)
            : await rpc.listMusicPlaylist(args);

      if (revision !== this.loadRevision) return false;
      if (!res.success) throw new Error(res.error);

      const item = res.data.items[0];
      if (!item) throw new Error(`This ${kind} no longer exists.`);

      this.setKind(kind);
      this.setItem(
        kind === "album"
          ? new MusicAlbum(item as ModelCreationData<MusicAlbum>)
          : kind === "artist"
            ? new MusicArtist(item as ModelCreationData<MusicArtist>)
            : new MusicPlaylist(item as ModelCreationData<MusicPlaylist>),
      );

      this.albumSearch.reset();

      const cover = await this.loadCover();
      if (revision !== this.loadRevision) return false;
      if (!cover.success) throw new Error(cover.error);

      // An artist's albums show oldest first, like their tracks.
      if (kind === "artist") {
        this.albumSearch.setArtistIds([id]);
        this.albumSearch.setSortValue({ isDesc: false, key: "year" });

        const albums = await this.albumSearch.loadFiltered({ noCache: true, page: 1 });
        if (revision !== this.loadRevision) return false;
        if (!albums.success) throw new Error(albums.error);
      }

      const loaded = await this.loadTracks();
      if (revision !== this.loadRevision) return false;
      if (!loaded.success) throw new Error(loaded.error);

      return true;
    } catch (error) {
      if (revision === this.loadRevision) throw error;

      return false;
    } finally {
      if (revision === this.loadRevision) this.setIsLoading(false);
    }
  });

  /**
   * Shows the page's tracks in order. A reload keeps the page and the selected tracks that are
   * still there.
   */
  @modelFlow
  loadTracks = asyncAction(async ({ isReload = false }: { isReload?: boolean } = {}) => {
    const revision = this.loadRevision;
    const fileIds = [...(this.item?.fileIds ?? [])];
    const fileIdSet = new Set(fileIds);

    this.search.setForcePages(true);
    this.search.setIds(fileIds);
    this.search.setSelectedIds(
      isReload ? this.search.selectedIds.filter((id) => fileIdSet.has(id)) : [],
    );

    if (!fileIds.length) {
      this.search.setResults([]);
      this.search.setPage(1);
      this.search.setPageCount(1);
    } else {
      const res = await this.search.loadFiltered({
        noCache: true,
        page: isReload ? this.search.page : 1,
        withFullCount: true,
      });

      if (revision === this.loadRevision && !res.success) throw new Error(res.error);
    }
  });

  /** Moves the selected tracks one place earlier or later in the playlist. */
  @modelFlow
  moveTracks = asyncAction(async (down: boolean) => {
    const selectedIds = this.search.selectedIdSet;

    const res = await this.savePlaylistTracks(
      moveMusicTracks([...this.item.fileIds], (id) => selectedIds.has(id), down),
    );
    if (!res.success) throw new Error(res.error);
  });

  /** Opens a page. Opened from another page, Back returns to that one. */
  @modelFlow
  open = asyncAction(async (target: MusicItemTarget) => {
    if (!this.isOpen) this.setIsOpen(true);
    else if (this.item)
      this.setHistory([...derefMobx(this.history), { id: this.item.id, kind: this.kind }]);

    const res = await this.loadItem(target);
    if (!res.success) throw new Error(res.error);
  });

  /** Removes the selected tracks from the playlist; their files stay in the library. */
  @modelFlow
  removeTracks = asyncAction(async () => {
    const selectedIds = this.search.selectedIdSet;

    const res = await this.savePlaylistTracks(
      this.item.fileIds.filter((id) => !selectedIds.has(id)),
    );
    if (!res.success) throw new Error(res.error);
  });

  /**
   * Saves a track order edited from the loaded one. When the playlist changed meanwhile, it reloads
   * instead, so the next edit starts from its latest tracks.
   */
  @modelFlow
  savePlaylistTracks = asyncAction(async (fileIds: string[]) => {
    const id = this.item.id;

    this.setIsSaving(true);

    try {
      const res = await rpc.updateMusicPlaylist({
        expectedFileIds: [...this.item.fileIds],
        id,
        updates: { fileIds },
      });

      if (!res.success) {
        await this.loadItem({ id, kind: "playlist" });

        throw new Error(res.error);
      }

      this.updateItem(res.data);

      const synced = await this.syncTracks();
      if (!synced.success) throw new Error(synced.error);
    } finally {
      this.setIsSaving(false);
    }
  });

  /** Reloads the tracks in place after the page's tracks changed here or elsewhere. */
  @modelFlow
  syncTracks = asyncAction(async () => {
    if (this.item && !isDeepEqual([...this.item.fileIds], [...this.search.ids])) {
      const loaded = await this.loadTracks({ isReload: true });
      if (!loaded.success) throw new Error(loaded.error);
    }
  });

  /* --------------------------------- GETTERS -------------------------------- */
  @computed
  get isPlaylist() {
    return this.kind === "playlist";
  }
}
