import { dialog } from "@electron/remote";
import { useEffect, useState } from "react";
import { observer, SORT_OPTIONS, useStores } from "medior/store";
import { Button, Card, ConfirmModal, Modal, Text, View } from "medior/components";
import { RepairModal, Settings } from ".";
import { colors, CONSTANTS, loadConfig, saveConfig, trpc } from "medior/utils";
import { toast } from "react-toastify";

export const SettingsModal = observer(() => {
  const stores = useStores();

  const [isConfirmDiscardOpen, setIsConfirmDiscardOpen] = useState(false);

  useEffect(() => {
    handleLoadConfig();
  }, []);

  const handleCancel = () => {
    if (stores.home.settings.hasUnsavedChanges) setIsConfirmDiscardOpen(true);
    else handleClose();
  };

  const handleClose = async () => {
    stores.home.settings.setIsOpen(false);
    stores.home.settings.setHasUnsavedChanges(false);
    return true;
  };

  const handleLoadConfig = async () => {
    stores.home.settings.setIsLoading(true);
    const config = await loadConfig();
    stores.home.settings.update(config);
    stores.home.settings.setHasUnsavedChanges(false);
    stores.home.settings.setIsLoading(false);
  };

  const handleFileCardFitContain = () => stores.home.settings.setFileCardFit("contain");

  const handleFileCardFitCover = () => stores.home.settings.setFileCardFit("cover");

  const handleFolderToCollection = (checked: boolean) =>
    stores.home.settings.setFolderToCollMode(checked ? "withoutTag" : "none");

  const handleFoldersToTags = (checked: boolean) =>
    stores.home.settings.setFolderToTagsMode(checked ? "hierarchical" : "none");

  const handleMongoDbPathClick = async (event: React.MouseEvent) => {
    event.preventDefault();
    const res = await dialog.showOpenDialog({ properties: ["openDirectory"] });
    if (res.canceled) return;
    stores.home.settings.setDbPath(res.filePaths[0]);
  };

  const handleRepair = () => stores.home.settings.setIsRepairOpen(true);

  const handleSaveConfig = async () => {
    try {
      stores.home.settings.setIsLoading(true);

      const oldConfig = await loadConfig();
      const hasDbDiff =
        oldConfig.db.path !== stores.home.settings.db.path ||
        oldConfig.ports.db !== stores.home.settings.ports.db;
      const hasServerDiff = oldConfig.ports.server !== stores.home.settings.ports.server;
      const hasSocketDiff = oldConfig.ports.socket !== stores.home.settings.ports.socket;

      await saveConfig(stores.home.settings.getConfig());

      stores.faceRecog.clearQueue();
      stores.file.clearRefreshQueue();
      stores.import.manager.clearQueue();
      stores.tag.manager.clearRefreshQueue();

      if (hasDbDiff || hasServerDiff || hasSocketDiff)
        await trpc.reloadServers.mutate({
          emitReloadEvents: true,
          withDatabase: hasDbDiff,
          withServer: hasServerDiff,
          withSocket: hasSocketDiff,
        });

      stores.home.settings.setIsLoading(false);
      stores.home.settings.setHasUnsavedChanges(false);
      toast.success("Settings saved!");
    } catch (err) {
      stores.home.settings.setIsLoading(false);
      toast.error("Failed to save settings.");
    }
  };

  const toggleFolderToCollWithTag = () => stores.home.settings.toggleFolderToCollMode();

  const toggleFoldersToTagsCascading = () => stores.home.settings.setFolderToTagsMode("cascading");

  const toggleFoldersToTagsHierarchical = () =>
    stores.home.settings.setFolderToTagsMode("hierarchical");

  return (
    <Modal.Container
      isLoading={stores.home.settings.isLoading}
      onClose={handleCancel}
      height="100%"
      width="100%"
      maxWidth="55rem"
    >
      <Modal.Header>
        <Text preset="title">{"Settings"}</Text>
      </Modal.Header>

      <Modal.Content spacing="2rem" padding={{ bottom: "3rem" }}>
        <Settings.Section
          title="Database / Servers"
          rightNode={
            <Button
              text="Repair Database"
              icon="Build"
              onClick={handleRepair}
              color={colors.custom.black}
              padding={{ all: "0.5rem 0.8rem" }}
            />
          }
        >
          <View row spacing="0.5rem">
            <Settings.Input
              header="Database Path"
              configKey="db.path"
              onClick={handleMongoDbPathClick}
              flex={1}
            />

            <Settings.NumInput header="Database Port" configKey="ports.db" />

            <Settings.NumInput header="Server Port" configKey="ports.server" />

            <Settings.NumInput header="Socket Port" configKey="ports.socket" />

            {stores.home.settings.isRepairOpen && <RepairModal />}
          </View>

          <View column>
            <Settings.StorageInputs />
          </View>
        </Settings.Section>

        <Settings.Section title="Collections">
          <View row spacing="0.5rem" overflow="auto">
            <Settings.NumInput
              header="Editor - File Search Page Size"
              configKey="collection.editor.fileSearch.pageSize"
              minValue={1}
              maxValue={200}
              width="14rem"
            />

            <Settings.SortMenu
              header="Editor - Default Sort"
              configKey="collection.editor.search.sort"
              rows={SORT_OPTIONS.FileCollectionFile}
            />

            <Settings.NumInput
              header="Manager - Page Size"
              configKey="collection.manager.search.pageSize"
              minValue={25}
              maxValue={250}
              width="9rem"
            />

            <Settings.SortMenu
              header="Manager - Default Sort"
              configKey="collection.manager.search.sort"
              rows={SORT_OPTIONS.FileCollection}
            />
          </View>
        </Settings.Section>

        <Settings.Section title="Files">
          <View row spacing="0.5rem" overflow="auto">
            <Settings.NumInput
              header="Search Results Count"
              configKey="file.search.pageSize"
              minValue={25}
              maxValue={250}
              width="9rem"
            />

            <Settings.SortMenu
              header="Default Sort"
              configKey="file.search.sort"
              rows={SORT_OPTIONS.File}
            />

            <Card
              header="File Thumbnail Fit"
              row
              bgColor={colors.foregroundCard}
              padding={{ all: "0.1rem" }}
            >
              <Settings.Checkbox
                label="Contain"
                configKey="file.fileCardFit"
                checked={stores.home.settings.file.fileCardFit === "contain"}
                setChecked={handleFileCardFitContain}
              />

              <Settings.Checkbox
                label="Cover"
                configKey="file.fileCardFit"
                checked={stores.home.settings.file.fileCardFit === "cover"}
                setChecked={handleFileCardFitCover}
              />
            </Card>

            <Card
              header="Rating Icon"
              row
              bgColor={colors.foregroundCard}
              padding={{ all: "0.1rem" }}
            >
              <Settings.Checkbox label="Hide Unrated" configKey="file.hideUnratedIcon" />
            </Card>
          </View>

          <Card
            header="Handled / Displayed Image Types"
            row
            wrap="wrap"
            flex="inherit"
            bgColor={colors.foregroundCard}
          >
            {CONSTANTS.IMAGE_TYPES.map((ext) => (
              <Settings.ExtCheckbox key={ext} ext={ext} configKey="file.imageTypes" />
            ))}
          </Card>

          <Card
            header="Handled / Displayed Video Types"
            row
            wrap="wrap"
            flex="inherit"
            bgColor={colors.foregroundCard}
          >
            {CONSTANTS.VIDEO_TYPES.map((ext) => (
              <Settings.ExtCheckbox key={ext} ext={ext} configKey="file.videoTypes" />
            ))}
          </Card>
        </Settings.Section>

        <Settings.Section title="Imports">
          <View row spacing="0.5rem" overflow="auto">
            <View column spacing="0.3rem">
              <Settings.Checkbox label="Delete On Import" configKey="imports.deleteOnImport" />

              <Settings.Checkbox
                label="Ignore Prev. Deleted"
                configKey="imports.ignorePrevDeleted"
              />

              <Settings.Checkbox label="New Tags to RegEx" configKey="imports.withNewTagsToRegEx" />

              <Settings.Checkbox
                label="File to Tags (RegEx)"
                configKey="imports.withFileNameToTags"
              />

              <Settings.Input
                header="Folder Tags Delimiter"
                configKey="imports.folderDelimiter"
                width="10rem"
                textAlign="center"
              />
            </View>

            <View column spacing="0.3rem">
              <Settings.Checkbox
                label="Folder to Tags"
                configKey="imports.folderToTagsMode"
                checked={stores.home.settings.imports.folderToTagsMode !== "none"}
                setChecked={handleFoldersToTags}
              />

              <View column margins={{ left: "1rem" }} spacing="0.3rem">
                <Settings.Checkbox
                  label="Hierarchical"
                  configKey="imports.folderToTagsMode"
                  checked={stores.home.settings.imports.folderToTagsMode.includes("hierarchical")}
                  setChecked={toggleFoldersToTagsHierarchical}
                />

                <Settings.Checkbox
                  label="Cascading"
                  configKey="imports.folderToTagsMode"
                  checked={stores.home.settings.imports.folderToTagsMode === "cascading"}
                  setChecked={toggleFoldersToTagsCascading}
                />

                <Settings.Checkbox label="Delimited" configKey="imports.withDelimiters" />

                <Settings.Checkbox label="With RegEx" configKey="imports.withFolderNameRegEx" />
              </View>
            </View>

            <View column spacing="0.3rem">
              <Settings.Checkbox
                label="Folder to Collection"
                configKey="imports.folderToCollMode"
                checked={stores.home.settings.imports.folderToCollMode !== "none"}
                setChecked={handleFolderToCollection}
              />

              <View column margins={{ left: "1rem" }} spacing="0.3rem">
                <Settings.Checkbox
                  label="With Tags"
                  configKey="imports.folderToCollMode"
                  checked={stores.home.settings.imports.folderToCollMode === "withTag"}
                  setChecked={toggleFolderToCollWithTag}
                />
              </View>

              <Settings.Checkbox label="Diffusion Params" configKey="imports.withDiffParams" />

              <View column margins={{ left: "1rem" }} spacing="0.3rem">
                <Settings.Checkbox label="With Tags" configKey="imports.withDiffTags" />

                <View column margins={{ left: "1rem" }} spacing="0.3rem">
                  <Settings.Checkbox label="Model" configKey="imports.withDiffModel" />

                  <Settings.Checkbox label="With RegEx" configKey="imports.withDiffRegEx" />
                </View>
              </View>
            </View>

            <View column flex="1 0 auto" spacing="0.3rem">
              <Settings.Input header="Diffusion Tag Label" configKey="imports.labelDiff" />

              <Settings.Input
                header="Diffusion Model Tag Label"
                configKey="imports.labelDiffModel"
              />

              <Settings.Input
                header="Diffusion (Original) Tag Label"
                configKey="imports.labelDiffOriginal"
              />

              <Settings.Input
                header="Diffusion (Upscaled) Tag Label"
                configKey="imports.labelDiffUpscaled"
              />
            </View>
          </View>
        </Settings.Section>

        <Settings.Section title="Tags">
          <View row>
            <Settings.SortMenu
              header="Manager - Default Sort"
              configKey="tags.manager.search.sort"
              rows={SORT_OPTIONS.Tag}
            />
          </View>
        </Settings.Section>
      </Modal.Content>

      <Modal.Footer>
        <Button text="Cancel" icon="Close" onClick={handleCancel} />

        <Button
          text="Save"
          icon="Save"
          onClick={handleSaveConfig}
          disabled={!stores.home.settings.hasUnsavedChanges}
          color={stores.home.settings.hasUnsavedChanges ? colors.custom.blue : undefined}
        />
      </Modal.Footer>

      {isConfirmDiscardOpen && (
        <ConfirmModal
          headerText="Discard Changes"
          subText="Are you sure you want to discard your changes?"
          confirmText="Discard"
          setVisible={setIsConfirmDiscardOpen}
          onConfirm={handleClose}
        />
      )}
    </Modal.Container>
  );
});
