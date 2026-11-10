import { dialog } from "@electron/remote";
import { useEffect, useRef } from "react";
import {
  Button,
  Card,
  CardGrid,
  Chip,
  Comp,
  FileActionButtons,
  IconName,
  LoadingOverlay,
  Modal,
  MultiActionButton,
  MusicAlbumCard,
  MusicArtistCard,
  MusicFilterMenu,
  MusicPlayerBar,
  MusicPlaylistCard,
  MusicTrackCard,
  MusicTrackFilterMenu,
  Pagination,
  SEARCH_HEADER_PROPS,
  SearchLoadingOverlay,
  SelectionButtons,
  UniformList,
  useMediaProgramHotkeys,
  View,
} from "medior/components";
import { MusicManagerTab, MusicTrackSearch, useStores } from "medior/store";
import { colors, CssColor, makeClasses, toast } from "medior/utils/client";

const TABS: { icon: IconName; label: string; value: MusicManagerTab }[] = [
  { icon: "MusicNote", label: "Tracks", value: "tracks" },
  { icon: "Person", label: "Artists", value: "artists" },
  { icon: "Album", label: "Albums", value: "albums" },
  { icon: "QueueMusic", label: "Playlists", value: "playlists" },
];

/**
 * Browses the music library's tracks, the artists and albums built from their tags, and playlists,
 * with the player below them, above the pagination.
 */
export const MusicManager = Comp(() => {
  const stores = useStores();
  const store = stores.music.manager;

  const cardsRef = useRef<HTMLDivElement>(null);

  const search = store.search;
  const hasSelection = search.selectedIds.length > 0;
  const isPlaylists = store.tab === "playlists";
  const page = search.page;
  const pageCount = search.pageCount;
  // The playing track's cover art colors the whole view while Settings uses them.
  const theme = stores.music.player.coverTheme;

  const { css } = useClasses({ background: theme?.background });

  // Albums, artists, and playlists are rated by their tracks, so only tracks take ratings.
  const handleKeyPress = useMediaProgramHotkeys({
    hotkeyGroup: "music",
    itemLabel: store.tab,
    rate:
      store.tab === "tracks"
        ? (id, rating) => stores.file.setFileRating({ fileIds: [id], rating })
        : undefined,
    search,
  });

  // Each tab loads its page when first shown and keeps it while another tab is.
  useEffect(() => {
    handlePageChange(page);
  }, [store.tab]);

  useEffect(() => {
    cardsRef.current?.scrollTo({ behavior: "instant", top: 0 });
  }, [page, pageCount, store.tab]);

  const handleCreate = async () => {
    store.setIsLoading(true);

    try {
      const res = await stores.music.createPlaylist({ name: "Untitled Playlist" });
      if (!res.success) throw new Error(res.error);

      const opened = await stores.music.editor.open({ id: res.data.id, kind: "playlist" });
      if (!opened.success) throw new Error(opened.error);
    } catch (error) {
      toast.error(error);
    } finally {
      store.setIsLoading(false);
    }
  };

  const handleDelete = () => stores.music.setIdsForConfirmDelete([...search.selectedIds]);

  const handleFullPageLoad = async () => {
    const res = await search.loadFiltered({ toLastPage: true });
    if (!res.success) toast.error(res.error);
  };

  const handleImport = async () => {
    const res = await dialog.showOpenDialog({
      filters: [{ extensions: ["m3u", "m3u8"], name: "Playlists" }],
      properties: ["openFile", "multiSelections"],
    });
    if (res.canceled || !res.filePaths.length) return;

    store.setIsLoading(true);
    const imported = await stores.music.importPlaylists(res.filePaths);
    store.setIsLoading(false);

    if (!imported.success) toast.error(imported.error);
  };

  const handlePageChange = async (page: number) => {
    const res = await search.loadFiltered({ page });
    if (!res.success) toast.error(res.error);
  };

  return (
    <View column flex={1} minHeight={0} overflow="hidden" className={css.root}>
      <LoadingOverlay isLoading={store.isLoading} />

      <Modal.Content dividers={false} overflow="hidden" padding={{ all: 0 }}>
        <Card
          flex={1}
          height="100%"
          overflow="hidden"
          padding={{ all: 0 }}
          bgColor={theme?.background ?? colors.background}
          headerProps={
            theme ? { ...SEARCH_HEADER_PROPS, bgColor: theme.header } : SEARCH_HEADER_PROPS
          }
          header={
            <UniformList row flex={1} justify="space-between">
              <View row align="center" spacing="0.5rem">
                {search instanceof MusicTrackSearch ? (
                  <MusicTrackFilterMenu store={search} />
                ) : (
                  <MusicFilterMenu store={search} />
                )}

                {hasSelection && <Chip label={`${search.selectedIds.length} Selected`} />}
              </View>

              <View row justify="center" align="center" spacing="0.5rem">
                {TABS.map((tab) => {
                  const isActive = tab.value === store.tab;

                  return (
                    <Button
                      key={tab.value}
                      text={tab.label}
                      icon={tab.icon}
                      onClick={() => store.setTab(tab.value)}
                      color={isActive ? colors.control : "transparent"}
                      colorOnHover={colors.control}
                      textColor={isActive ? colors.custom.white : colors.custom.lightGrey}
                    />
                  );
                })}
              </View>

              <View row justify="flex-end">
                {isPlaylists && (
                  <MultiActionButton
                    name="Delete"
                    tooltip="Delete"
                    iconProps={{ color: hasSelection ? colors.custom.red : colors.custom.grey }}
                    onClick={handleDelete}
                    disabled={!hasSelection}
                  />
                )}

                {store.tab === "tracks" && <FileActionButtons store={store.tracks} />}

                <SelectionButtons itemLabel={store.tab} store={search} toast={toast} />
              </View>
            </UniformList>
          }
        >
          <View flex={1} position="relative" overflow="hidden">
            <SearchLoadingOverlay store={search} />

            <CardGrid
              ref={cardsRef}
              cards={
                store.tab === "tracks"
                  ? store.tracks.results.map((file) => (
                      <MusicTrackCard key={file.id} file={file} search={store.tracks} />
                    ))
                  : store.tab === "albums"
                    ? store.albums.results.map((album) => (
                        <MusicAlbumCard key={album.id} album={album} search={store.albums} />
                      ))
                    : store.tab === "artists"
                      ? store.artists.results.map((artist) => (
                          <MusicArtistCard key={artist.id} artist={artist} search={store.artists} />
                        ))
                      : store.playlists.results.map((playlist) => (
                          <MusicPlaylistCard
                            key={playlist.id}
                            playlist={playlist}
                            search={store.playlists}
                          />
                        ))
              }
              cardsProps={{ onKeyDown: handleKeyPress, tabIndex: 1 }}
              maxCards={8}
              noResultsText={`No ${store.tab} found`}
              height="100%"
            />
          </View>

          <MusicPlayerBar />

          <Pagination
            inline
            count={pageCount}
            page={page}
            onChange={handlePageChange}
            isLoading={search.isPageCountLoading && !search.isLoading}
            onFullLoad={handleFullPageLoad}
            className={css.pagination}
          />
        </Card>
      </Modal.Content>

      {isPlaylists && (
        <Modal.Footer>
          <Button
            text="Import"
            icon="Download"
            onClick={handleImport}
            colorOnHover={colors.custom.blue}
          />

          <Button
            text="Create"
            icon="Add"
            onClick={handleCreate}
            colorOnHover={colors.custom.blue}
          />
        </Modal.Footer>
      )}
    </View>
  );
});

interface ClassesProps {
  /** The cover art color behind the view, or none to keep the usual colors. */
  background: CssColor | undefined;
}

const useClasses = makeClasses((props: ClassesProps) => ({
  root: {
    background: props.background,
  },
  pagination: {
    backgroundColor: props.background,
  },
}));
