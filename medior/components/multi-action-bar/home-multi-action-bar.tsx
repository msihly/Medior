import { AppBar } from "@mui/material";
import { Chip, Comp, FileFilter, View } from "medior/components";
import { handleReingest, useStores } from "medior/store";
import { colors, makeClasses, toast } from "medior/utils/client";
import { CONSTANTS } from "medior/utils/common";
import { MultiActionButton, SelectedFilesInfo } from ".";

export const HomeMultiActionBar = Comp(() => {
  const stores = useStores();
  const { css } = useClasses(null);

  const selectedIds = [...stores.file.search.selectedIds];
  const hasNoSelection = selectedIds.length === 0;

  const handleAutoDetect = () => stores.faceRecog.addFilesToAutoDetectQueue(selectedIds);

  const handleDelete = () => stores.file.confirmDeleteFiles(selectedIds);

  const handleDeselectAll = () => {
    stores.file.search.toggleSelected(selectedIds.map((id) => ({ id, isSelected: false })));
    toast.info("Deselected all files");
  };

  const handleEditCollections = () => {
    stores.collection.manager.setSelectedFileIds(selectedIds);
    stores.collection.manager.setIsOpen(true);
  };

  const handleEditTags = () => {
    stores.file.tagsEditor.setBatchId(null);
    stores.file.tagsEditor.setFileIds(selectedIds);
    stores.file.tagsEditor.setIsOpen(true);
  };

  const handleFileInfoRefresh = () => stores.file.refreshFiles({ ids: selectedIds });

  const handleReencode = () => stores.file.openVideoTransformer(selectedIds, "reencode");

  const handleRemux = () => stores.file.openVideoTransformer(selectedIds, "remux");

  const handleSelectAll = () => {
    stores.file.search.toggleSelected(
      stores.file.search.results.map(({ id }) => ({ id, isSelected: true })),
    );
    toast.info(`Added ${stores.file.search.results.length} files to selection`);
  };

  const handleUnarchive = () => stores.file.unarchiveFiles({ fileIds: selectedIds });

  const reingest = async () =>
    await handleReingest({ fileIds: selectedIds, store: stores.import.reingester });

  return (
    <AppBar position="static" className={css.appBar}>
      <View className={css.container}>
        <View row align="center" spacing="0.5rem">
          <View row width="10rem">
            <FileFilter.Menu store={stores.file.search} />
          </View>

          {stores.file.search.isArchiveOpen && (
            <Chip label="Archived" bgColor={colors.custom.red} />
          )}

          {stores.file.search.selectedIds.length > 0 && <SelectedFilesInfo />}
        </View>

        <View row align="center" spacing="0.5rem">
          {stores.file.search.isArchived && (
            <MultiActionButton
              name="Delete"
              tooltip="Delete"
              iconProps={{ color: colors.custom.red }}
              onClick={handleDelete}
              disabled={hasNoSelection}
            />
          )}

          <MultiActionButton
            name={stores.file.search.isArchived ? "Unarchive" : "Archive"}
            tooltip={stores.file.search.isArchived ? "Unarchive" : "Archive"}
            onClick={stores.file.search.isArchived ? handleUnarchive : handleDelete}
            disabled={hasNoSelection}
          />

          <MultiActionButton
            name="AutoMode"
            iconProps={{ size: "0.8em" }}
            tooltip="Re-encode Videos"
            onClick={handleReencode}
            disabled={hasNoSelection}
          />

          <MultiActionButton
            name="RotateRight"
            iconProps={{ rotation: 270, size: "1.1em" }}
            tooltip="Remux Videos"
            onClick={handleRemux}
            disabled={hasNoSelection}
          />

          <MultiActionButton
            name="Refresh"
            tooltip="Refresh File Info"
            onClick={handleFileInfoRefresh}
            disabled={hasNoSelection}
          />

          <MultiActionButton
            name="GetApp"
            tooltip="Reingest"
            onClick={reingest}
            disabled={hasNoSelection}
          />

          <MultiActionButton
            name="Face"
            tooltip="Auto Detect Faces"
            onClick={handleAutoDetect}
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

          <MultiActionButton
            name="Deselect"
            tooltip="Deselect All Files"
            onClick={handleDeselectAll}
            disabled={hasNoSelection}
          />

          <MultiActionButton
            name="SelectAll"
            tooltip="Select All Files in View"
            onClick={handleSelectAll}
          />
        </View>
      </View>
    </AppBar>
  );
});

const useClasses = makeClasses({
  appBar: {
    display: "flex",
    flexFlow: "row nowrap",
    flexGrow: 1,
    flexShrink: 0,
    boxShadow: "rgb(0 0 0 / 50%) 2px 2px 4px 0px",
    zIndex: 5,
  },
  container: {
    display: "flex",
    flexGrow: 1,
    flexShrink: 0,
    justifyContent: "space-between",
    height: CONSTANTS.HOME.TOP_BAR.HEIGHT,
    padding: "0.3rem 0.5rem",
    background: colors.background,
  },
});
