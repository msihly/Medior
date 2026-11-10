import { SortValue } from "medior/store/_generated";
import { Comp, MultiActionButton } from "medior/components";
import { FileSearch, handleReingest, useStores } from "medior/store";
import { colors, openHomeView } from "medior/utils/client";

export interface FileActionButtonsProps {
  /** The Files view's sort, which video transforms keep for their files. */
  sourceSortValue?: SortValue;
  store: FileSearch;
}

/** Actions on a file search's selected files, such as archiving, transforms, tags, and export. */
export const FileActionButtons = Comp(({ sourceSortValue, store }: FileActionButtonsProps) => {
  const stores = useStores();

  const selectedIds = [...store.selectedIds];
  const hasNoSelection = selectedIds.length === 0;

  const handleAddToPlaylist = () => stores.music.setPlaylistPickerFileIds(selectedIds);

  const handleDelete = () => stores.file.confirmDeleteFiles(selectedIds);

  // Carousels show these in Find Similar, so the views they open show in the main window.
  const handleEditCollections = () => openHomeView({ fileIds: selectedIds, view: "collections" });

  const handleEditTags = () => {
    stores.file.tagsEditor.setFileIds(selectedIds);
    stores.file.tagsEditor.setIsOpen(true);
  };

  const handleExport = () => stores.file.exporter.open(selectedIds);

  const handleFileInfoRefresh = () => stores.file.refreshFiles({ ids: selectedIds });

  const handleReencode = () =>
    openHomeView({
      fileIds: selectedIds,
      fnType: "reencode",
      sortValue: sourceSortValue,
      view: "transformer",
    });

  const handleRemux = () =>
    openHomeView({
      fileIds: selectedIds,
      fnType: "remux",
      sortValue: sourceSortValue,
      view: "transformer",
    });

  // Without shared timestamps, each selected video is spliced by its own single timeline.
  const handleSplice = () =>
    openHomeView({
      fileIds: selectedIds,
      fnType: "splice",
      sortValue: sourceSortValue,
      view: "transformer",
    });

  const handleUnarchive = () => stores.file.unarchiveFiles({ fileIds: selectedIds });

  const reingest = () => handleReingest({ fileIds: selectedIds, store: stores.import.editor });

  return (
    <>
      {store.isArchived && (
        <MultiActionButton
          name="Delete"
          tooltip="Delete"
          iconProps={{ color: colors.custom.red }}
          onClick={handleDelete}
          disabled={hasNoSelection}
        />
      )}

      <MultiActionButton
        name={store.isArchived ? "Unarchive" : "Archive"}
        tooltip={store.isArchived ? "Unarchive" : "Archive"}
        onClick={store.isArchived ? handleUnarchive : handleDelete}
        disabled={hasNoSelection}
      />

      <MultiActionButton
        name="FileExport"
        tooltip="Export"
        onClick={handleExport}
        disabled={hasNoSelection}
      />

      <MultiActionButton
        name="GetApp"
        tooltip="Reingest"
        onClick={reingest}
        disabled={hasNoSelection}
      />

      <MultiActionButton
        name="ContentCut"
        tooltip="Splice Videos with a Single Timeline"
        onClick={handleSplice}
        disabled={hasNoSelection}
      />

      <MultiActionButton
        name="AutoMode"
        iconProps={{ size: "0.85em" }}
        tooltip="Re-encode Media"
        onClick={handleReencode}
        disabled={hasNoSelection}
      />

      <MultiActionButton
        name="RotateRight"
        iconProps={{ rotation: 240, size: "1.1em" }}
        tooltip="Remux Videos"
        onClick={handleRemux}
        disabled={hasNoSelection}
      />

      <MultiActionButton
        name="Refresh"
        iconProps={{ rotation: 190, size: "1.1em" }}
        tooltip="Refresh File Info"
        onClick={handleFileInfoRefresh}
        disabled={hasNoSelection}
      />

      <MultiActionButton
        name="PlaylistAdd"
        tooltip="Add to Playlist"
        onClick={handleAddToPlaylist}
        disabled={hasNoSelection}
      />

      <MultiActionButton
        name="Collections"
        tooltip="Edit Collections"
        onClick={handleEditCollections}
        disabled={hasNoSelection}
      />

      <MultiActionButton
        name="Label"
        tooltip="Edit Tags"
        onClick={handleEditTags}
        disabled={hasNoSelection}
      />
    </>
  );
});
