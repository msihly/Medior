import {
  CenteredText,
  Chip,
  Comp,
  MediaProgramSection,
  MusicAlbumCard,
  Pagination,
  SearchLoadingOverlay,
  View,
} from "medior/components";
import { MusicArtist, useStores } from "medior/store";
import { makeClasses, toast } from "medior/utils/client";
import { getMusicCountLabel } from "medior/utils/common";

/** The albums of the artist whose page is open. */
export const MusicArtistAlbums = Comp(() => {
  const stores = useStores();
  const store = stores.music.editor;

  const { css } = useClasses(null);

  const search = store.albumSearch;
  const albumCount = store.item instanceof MusicArtist ? store.item.albumCount : 0;

  const handlePageChange = async (page: number) => {
    const res = await search.loadFiltered({ page });
    if (!res.success) toast.error(res.error);
  };

  return (
    <MediaProgramSection
      title="Albums"
      info={<Chip label={getMusicCountLabel(albumCount, "Album")} />}
    >
      <View column position="relative" minHeight="10rem" spacing="0.75rem">
        <SearchLoadingOverlay store={search} />

        {search.results.length ? (
          <View className={css.grid}>
            {search.results.map((album) => (
              <MusicAlbumCard key={album.id} album={album} search={search} />
            ))}
          </View>
        ) : (
          <CenteredText text="No albums" />
        )}

        {search.pageCount > 1 && (
          <Pagination
            inline
            count={search.pageCount}
            page={search.page}
            onChange={handlePageChange}
            isLoading={search.isPageCountLoading && !search.isLoading}
          />
        )}
      </View>
    </MediaProgramSection>
  );
});

const useClasses = makeClasses({
  // Album cards space themselves, so the grid adds no gap of its own.
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(12rem, 1fr))",
  },
});
