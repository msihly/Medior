import { SORT_OPTIONS } from "medior/store/_generated";
import {
  Card,
  Comp,
  DateRange,
  FilterHeader,
  FilterMenu,
  Input,
  LogOpsInput,
  NumRange,
  View,
} from "medior/components";
import { MusicAlbumSearch, MusicArtistSearch, MusicPlaylistSearch } from "medior/store";

export interface MusicFilterMenuProps {
  store: MusicAlbumSearch | MusicArtistSearch | MusicPlaylistSearch;
}

/** Filters albums, artists, or playlists, with the artist and year filters of albums. */
export const MusicFilterMenu = Comp(({ store }: MusicFilterMenuProps) => {
  const albumSearch = store instanceof MusicAlbumSearch ? store : null;
  const artistSearch = store instanceof MusicArtistSearch ? store : null;

  const sortOptions = albumSearch
    ? SORT_OPTIONS.MusicAlbum
    : artistSearch
      ? SORT_OPTIONS.MusicArtist
      : SORT_OPTIONS.MusicPlaylist;

  return (
    <FilterMenu store={store} sortOptions={sortOptions}>
      <Card width="22rem" spacing="0.5rem">
        <Input
          header={<FilterHeader label="Name" mode={store.nameMode} setMode={store.setNameMode} />}
          value={store.name}
          setValue={store.setName}
        />

        {albumSearch && (
          <Input
            header={
              <FilterHeader
                label="Artist"
                mode={albumSearch.artistNameMode}
                setMode={albumSearch.setArtistNameMode}
              />
            }
            value={albumSearch.artistName}
            setValue={albumSearch.setArtistName}
          />
        )}

        <View row spacing="0.5rem">
          {artistSearch && (
            <LogOpsInput
              header={
                <FilterHeader
                  label="Albums"
                  mode={artistSearch.albumCountMode}
                  setMode={artistSearch.setAlbumCountMode}
                />
              }
              logOpValue={artistSearch.albumCount.logOp}
              numValue={artistSearch.albumCount.value}
              setLogOpValue={artistSearch.setAlbumCountOp}
              setNumValue={artistSearch.setAlbumCountValue}
              numInputProps={{ minValue: 0 }}
            />
          )}

          <LogOpsInput
            header={
              <FilterHeader
                label="Tracks"
                mode={store.fileCountMode}
                setMode={store.setFileCountMode}
              />
            }
            logOpValue={store.fileCount.logOp}
            numValue={store.fileCount.value}
            setLogOpValue={store.setFileCountOp}
            setNumValue={store.setFileCountValue}
            numInputProps={{ minValue: 0 }}
          />

          <LogOpsInput
            header={
              <FilterHeader label="Rating" mode={store.ratingMode} setMode={store.setRatingMode} />
            }
            logOpValue={store.rating.logOp}
            numValue={store.rating.value}
            setLogOpValue={store.setRatingOp}
            setNumValue={store.setRatingValue}
            numInputProps={{ maxValue: 9, minValue: 0 }}
          />
        </View>

        {albumSearch && (
          <NumRange
            header={
              <FilterHeader
                label="Year"
                mode={albumSearch.yearMode}
                setMode={albumSearch.setYearMode}
              />
            }
            min={albumSearch.minYear}
            max={albumSearch.maxYear}
            setMin={albumSearch.setMinYear}
            setMax={albumSearch.setMaxYear}
          />
        )}

        <DateRange
          header={
            <FilterHeader
              label="Date Created"
              mode={store.dateCreatedMode}
              setMode={store.setDateCreatedMode}
            />
          }
          startDate={store.dateCreatedStart}
          setStartDate={store.setDateCreatedStart}
          endDate={store.dateCreatedEnd}
          setEndDate={store.setDateCreatedEnd}
        />

        <DateRange
          header={
            <FilterHeader
              label="Date Modified"
              mode={store.dateModifiedMode}
              setMode={store.setDateModifiedMode}
            />
          }
          startDate={store.dateModifiedStart}
          setStartDate={store.setDateModifiedStart}
          endDate={store.dateModifiedEnd}
          setEndDate={store.setDateModifiedEnd}
        />
      </Card>
    </FilterMenu>
  );
});
