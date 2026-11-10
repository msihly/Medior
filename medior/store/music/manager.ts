import autoBind from "auto-bind";
import { computed } from "mobx";
import { Model, model, prop } from "mobx-keystone";
import { getConfig } from "medior/utils/server";
import { MusicAlbumSearch, MusicArtistSearch, MusicPlaylistSearch, MusicTrackSearch } from ".";

export type MusicManagerTab = "albums" | "artists" | "playlists" | "tracks";

@model("medior/MusicManagerStore")
export class MusicManagerStore extends Model({
  albums: prop<MusicAlbumSearch>(() => new MusicAlbumSearch({})),
  artists: prop<MusicArtistSearch>(() => new MusicArtistSearch({})),
  isLoading: prop<boolean>(false).withSetter(),
  isOpen: prop<boolean>(false).withSetter(),
  playlists: prop<MusicPlaylistSearch>(() => new MusicPlaylistSearch({})),
  tab: prop<MusicManagerTab>("tracks").withSetter(),
  tracks: prop<MusicTrackSearch>(
    () =>
      new MusicTrackSearch({
        hasMusic: true,
        pageSize: getConfig().music.tracks.search.pageSize,
        sortValue: getConfig().music.tracks.search.sort,
      }),
  ),
}) {
  onInit() {
    autoBind(this);
  }

  /* --------------------------------- GETTERS -------------------------------- */
  /** The search of the tab being shown. */
  @computed
  get search() {
    return this[this.tab];
  }
}
