import { useRef, useState } from "react";
import {
  CenteredText,
  Chip,
  Comp,
  ConfirmModal,
  FileActionButtons,
  MediaProgramSection,
  MultiActionButton,
  MusicTrackRow,
  Pagination,
  SearchLoadingOverlay,
  SelectionButtons,
  useMediaProgramHotkeys,
  View,
} from "medior/components";
import { useStores } from "medior/store";
import { colors, toast } from "medior/utils/client";
import { Fmt, getMusicCountLabel } from "medior/utils/common";

/** The page's tracks, with actions on the selected ones and, on playlists, their order. */
export const MusicTracks = Comp(() => {
  const stores = useStores();
  const store = stores.music.editor;

  const [isRemoveOpen, setIsRemoveOpen] = useState(false);

  const sectionRef = useRef<HTMLDivElement>(null);

  const selectedCount = store.search.selectedIds.length;
  const isDisabled = store.isLoading || store.isSaving || !selectedCount;
  const pageOffset = (store.search.page - 1) * store.search.pageSize;

  const handleKeyPress = useMediaProgramHotkeys({
    hotkeyGroup: "music",
    itemLabel: "tracks",
    rate: (id, rating) => stores.file.setFileRating({ fileIds: [id], rating }),
    search: store.search,
  });

  const handleMove = async (down: boolean) => {
    const res = await store.moveTracks(down);
    if (!res.success) toast.error(res.error);
  };

  const handlePlay = async (fileId: string) => {
    const res = await stores.music.play({ fileId, fileIds: [...store.item.fileIds] });
    if (!res.success) toast.error(res.error);
  };

  /** The new page starts at the top of the tracks, which the pagination below them scrolled past. */
  const handlePageChange = async (page: number) => {
    const res = await store.search.loadFiltered({ page });
    if (!res.success) toast.error(res.error);
    else sectionRef.current?.scrollIntoView({ behavior: "instant", block: "start" });
  };

  const handleRemove = async () => {
    const res = await store.removeTracks();
    if (!res.success) toast.error(res.error);

    return res.success;
  };

  return (
    <MediaProgramSection
      ref={sectionRef}
      title="Tracks"
      info={
        <>
          <Chip label={getMusicCountLabel(store.item?.fileCount ?? 0, "Track")} />

          {selectedCount > 0 && (
            <Chip label={`${Fmt.commas(selectedCount)} Selected`} bgColor={colors.custom.blue} />
          )}
        </>
      }
      actions={
        <>
          {store.isPlaylist && (
            <>
              <MultiActionButton
                name="ArrowUpward"
                tooltip="Move Selected Earlier"
                onClick={() => handleMove(false)}
                disabled={isDisabled}
              />

              <MultiActionButton
                name="ArrowDownward"
                tooltip="Move Selected Later"
                onClick={() => handleMove(true)}
                disabled={isDisabled}
              />

              <MultiActionButton
                name="PlaylistRemove"
                tooltip="Remove Selected From Playlist"
                iconProps={{ color: isDisabled ? colors.custom.grey : colors.custom.red }}
                onClick={() => setIsRemoveOpen(true)}
                disabled={isDisabled}
              />
            </>
          )}

          <FileActionButtons isHome store={store.search} />

          <SelectionButtons itemLabel="tracks" store={store.search} toast={toast} />
        </>
      }
    >
      <View column position="relative" minHeight="10rem" spacing="0.75rem">
        <SearchLoadingOverlay store={store.search} />

        {store.search.results.length ? (
          <View column tabIndex={1} onKeyDown={handleKeyPress}>
            {store.search.results.map((file, index) => (
              <MusicTrackRow
                key={file.id}
                carouselFileIds={store.item?.fileIds}
                file={file}
                number={
                  (store.kind === "album" && file.music?.trackNumber) || pageOffset + index + 1
                }
                onPlay={handlePlay}
                search={store.search}
              />
            ))}
          </View>
        ) : (
          <CenteredText text="No tracks" />
        )}

        {store.search.pageCount > 1 && (
          <Pagination
            inline
            count={store.search.pageCount}
            page={store.search.page}
            onChange={handlePageChange}
            isLoading={store.search.isPageCountLoading && !store.search.isLoading}
          />
        )}
      </View>

      {isRemoveOpen && (
        <ConfirmModal
          headerText="Remove Tracks"
          subText={`Remove ${getMusicCountLabel(selectedCount, "track")} from ${store.item?.name}? Their files stay in your library.`}
          confirmText="Remove"
          setVisible={setIsRemoveOpen}
          onConfirm={handleRemove}
        />
      )}
    </MediaProgramSection>
  );
});
