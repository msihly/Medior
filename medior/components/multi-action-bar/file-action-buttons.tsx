import { SortValue } from "medior/store/_generated";
import { Comp, MultiActionButton } from "medior/components";
import { FileSearch, handleReingest, useStores } from "medior/store";
import { colors } from "medior/utils/client";

export interface FileActionButtonsProps {
  /** Video transforms and reingesting open only from the home window. */
  isHome?: boolean;
  /** The home search's sort, which video transforms keep for their files. */
  sourceSortValue?: SortValue;
  store: FileSearch;
}

/** Actions on a file search's selected files, such as archiving, transforms, tags, and export. */
export const FileActionButtons = Comp(
  ({ isHome = false, sourceSortValue, store }: FileActionButtonsProps) => {
    const stores = useStores();

    const selectedIds = [...store.selectedIds];
    const hasNoSelection = selectedIds.length === 0;

    // const handleAutoDetect = () => stores.faceRecog.addFilesToAutoDetectQueue(selectedIds);

    const handleAddToPlaylist = () => stores.music.setPlaylistPickerFileIds(selectedIds);

    const handleDelete = () => stores.file.confirmDeleteFiles(selectedIds);

    const handleEditCollections = () => {
      stores.collection.manager.setSelectedFileIds(selectedIds);
      stores.collection.manager.setIsOpen(true);
    };

    const handleEditTags = () => {
      stores.file.tagsEditor.setFileIds(selectedIds);
      stores.file.tagsEditor.setIsOpen(true);
    };

    const handleExport = () => stores.file.exporter.open(selectedIds);

    const handleFileInfoRefresh = () => stores.file.refreshFiles({ ids: selectedIds });

    const handleReencode = () =>
      stores.file.openVideoTransformer(selectedIds, "reencode", sourceSortValue);

    const handleRemux = () =>
      stores.file.openVideoTransformer(selectedIds, "remux", sourceSortValue);

    // Without shared timestamps, each selected video is spliced by its own single timeline.
    const handleSplice = () => {
      stores.file.videoTransformer.setTimestampPairs([]);
      stores.file.openVideoTransformer(selectedIds, "splice", sourceSortValue);
    };

    const handleUnarchive = () => stores.file.unarchiveFiles({ fileIds: selectedIds });

    const reingest = () =>
      handleReingest({ fileIds: selectedIds, store: stores.import.reingester });

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
          name="ContentCut"
          tooltip="Splice Videos with a Single Timeline"
          onClick={handleSplice}
          disabled={hasNoSelection || !isHome}
        />

        <MultiActionButton
          name="AutoMode"
          iconProps={{ size: "0.85em" }}
          tooltip="Re-encode Media"
          onClick={handleReencode}
          disabled={hasNoSelection || !isHome}
        />

        <MultiActionButton
          name="RotateRight"
          iconProps={{ rotation: 240, size: "1.1em" }}
          tooltip="Remux Videos"
          onClick={handleRemux}
          disabled={hasNoSelection || !isHome}
        />

        <MultiActionButton
          name="Refresh"
          iconProps={{ rotation: 190, size: "1.1em" }}
          tooltip="Refresh File Info"
          onClick={handleFileInfoRefresh}
          disabled={hasNoSelection}
        />

        <MultiActionButton
          name="GetApp"
          tooltip="Reingest"
          onClick={reingest}
          disabled={hasNoSelection || !isHome}
        />

        {/* <MultiActionButton
          name="Face"
          tooltip="Auto Detect Faces"
          onClick={handleAutoDetect}
          disabled={hasNoSelection || !isHome}
        /> */}

        <MultiActionButton
          name="Collections"
          tooltip="Edit Collections"
          onClick={handleEditCollections}
          disabled={hasNoSelection}
        />

        <MultiActionButton
          name="PlaylistAdd"
          tooltip="Add to Playlist"
          onClick={handleAddToPlaylist}
          disabled={hasNoSelection}
        />

        <MultiActionButton
          name="Label"
          tooltip="Edit Tags"
          onClick={handleEditTags}
          disabled={hasNoSelection}
        />

        <MultiActionButton
          name="FileExport"
          tooltip="Export"
          onClick={handleExport}
          disabled={hasNoSelection}
        />
      </>
    );
  },
);
