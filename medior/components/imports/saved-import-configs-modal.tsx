import path from "path";
import { useEffect, useState } from "react";
import { SORT_OPTIONS } from "medior/store/_generated";
import {
  Button,
  Card,
  CenteredText,
  Comp,
  ConfirmModal,
  FilterMenu,
  Input,
  Modal,
  Pagination,
  Text,
  View,
} from "medior/components";
import {
  Ingester,
  Reingester,
  SavedImportConfig,
  SavedImportConfigSearch,
  useStores,
} from "medior/store";
import { normalizeImportConfigPath } from "medior/store/saved-import-config";
import { colors, toast } from "medior/utils/client";
import { dayjs } from "medior/utils/common";

export interface SavedImportConfigsModalProps {
  onClose: () => void;
  store?: Ingester | Reingester;
}

export const SavedImportConfigsModal = Comp(
  ({ onClose, store: editorStore }: SavedImportConfigsModalProps) => {
    const stores = useStores();
    const store = stores.import.savedConfigSearch;

    const [configFolderPath, setConfigFolderPath] = useState("");
    const [configLabel, setConfigLabel] = useState(getDefaultConfigLabel(editorStore));
    const [editingLabelConfigId, setEditingLabelConfigId] = useState("");
    const [editingLabel, setEditingLabel] = useState("");
    const [overwriteConfig, setOverwriteConfig] = useState<SavedImportConfig>(null);

    const canSave =
      !!editorStore?.rootFolderPath && !!configLabel.trim() && !!configFolderPath.trim();

    useEffect(() => {
      stores.import.loadSavedConfigs();
      store.loadFiltered({ noCache: true, page: 1 });
    }, [store]);

    useEffect(() => {
      resetEditorConfig();
    }, [editorStore?.rootFolderPath, editorStore?.rootFolderIndex]);

    const clearLabelEditing = () => {
      setEditingLabelConfigId("");
      setEditingLabel("");
    };

    const editConfigLabel = (config: SavedImportConfig) => {
      setEditingLabelConfigId(config.id);
      setEditingLabel(config.label);
    };

    const refreshConfigs = async () => {
      await stores.import.loadSavedConfigs();
      await store.loadFiltered({ noCache: true, page: store.page });
    };

    const resetEditorConfig = () => {
      setConfigLabel(getDefaultConfigLabel(editorStore));
      setConfigFolderPath(getEditorConfigPath(editorStore));
    };

    const getOverwriteConfig = (folderPath: string) => {
      const normalizedFolderPath = normalizeImportConfigPath(folderPath);
      return stores.import.savedConfigs.find(
        (config) => config.normalizedFolderPath === normalizedFolderPath,
      );
    };

    const handleSaveConfig = () => {
      const folderPath = getSaveFolderPath(configFolderPath);
      const existing = getOverwriteConfig(folderPath);
      if (existing) setOverwriteConfig(existing);
      else void saveConfig();
    };

    const saveConfig = async (id?: string) => {
      try {
        if (!editorStore?.rootFolderPath) {
          throw new Error("Open the Import Editor with a loaded folder first");
        }

        const folderPath = getSaveFolderPath(configFolderPath);
        await stores.import.saveSavedConfig({
          folderPath,
          id,
          label: configLabel.trim() || getDefaultConfigLabel(editorStore),
          options: editorStore.options.toSavedConfig(),
        });

        await refreshConfigs();
        resetEditorConfig();
        setOverwriteConfig(null);
        toast.success("Saved import config saved");
        return true;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to save import config");
        return false;
      }
    };

    const confirmOverwrite = async () => saveConfig(overwriteConfig.id);

    const deleteConfig = async (id: string) => {
      try {
        await stores.import.deleteSavedConfig(id);
        await refreshConfigs();

        if (editingLabelConfigId === id) clearLabelEditing();

        toast.warn("Saved import config deleted");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to delete import config");
      }
    };

    const saveConfigLabel = async (id: string) => {
      try {
        await stores.import.renameSavedConfig({ id, label: editingLabel.trim() });
        await refreshConfigs();
        clearLabelEditing();

        toast.success("Saved import config label updated");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to update import config label");
      }
    };

    return (
      <Modal.Container onClose={onClose} width="60rem" maxWidth="95%" height="90%">
        <Modal.Header leftNode={<SavedImportConfigsFilterMenu store={store} />}>
          <Text preset="title">{"Saved Import Configs"}</Text>
        </Modal.Header>

        <Modal.Content dividers={false}>
          <View column spacing="0.8rem" height="100%" overflow="hidden" position="relative">
            {editorStore && (
              <Card column spacing="0.6rem" bgColor={colors.background}>
                <View row align="stretch" spacing={0}>
                  <Input
                    header="Config Label"
                    headerProps={{ borderRadiuses: { topRight: 0 } }}
                    value={configLabel}
                    setValue={setConfigLabel}
                    borders={{ right: "none" }}
                    borderRadiuses={{ right: 0 }}
                    dense
                    flex={1}
                  />

                  <Input
                    header="Folder Path"
                    headerProps={{ borderRadiuses: { topLeft: 0, topRight: 0 } }}
                    value={configFolderPath}
                    setValue={setConfigFolderPath}
                    borders={{ right: "none" }}
                    borderRadiuses={{ left: 0, right: 0 }}
                    dense
                    flex={2}
                  />

                  <Button
                    icon="Save"
                    onClick={handleSaveConfig}
                    disabled={!canSave}
                    borderRadiuses={{ left: 0 }}
                    color={colors.custom.blue}
                    height="100%"
                  />
                </View>
              </Card>
            )}

            <View
              column
              flex={1}
              overflow="hidden auto"
              spacing="0.5rem"
              padding={{ bottom: "4rem" }}
            >
              {store.results.length ? (
                store.results.map((config) => (
                  <Card
                    key={config.id}
                    row
                    align="center"
                    spacing="0.7rem"
                    bgColor={
                      editingLabelConfigId === config.id ? colors.custom.darkGrey : undefined
                    }
                  >
                    <View column flex={1} spacing="0.3rem" overflow="hidden">
                      {editingLabelConfigId === config.id ? (
                        <Input value={editingLabel} setValue={setEditingLabel} dense />
                      ) : (
                        <Text
                          fontWeight={500}
                          textOverflow="ellipsis"
                          overflow="hidden"
                          whiteSpace="nowrap"
                        >
                          {config.label}
                        </Text>
                      )}

                      <Text
                        color={colors.custom.lightGrey}
                        fontSize="0.85em"
                        textOverflow="ellipsis"
                        overflow="hidden"
                        whiteSpace="nowrap"
                      >
                        {config.folderPath}
                      </Text>

                      <View row spacing="0.5rem" overflow="hidden">
                        <Text color={colors.custom.lightGrey} fontSize="0.7em">
                          {`Created: ${formatDate(config.dateCreated)}`}
                        </Text>

                        <Text color={colors.custom.lightGrey} fontSize="0.7em">
                          {`Modified: ${formatDate(config.dateModified)}`}
                        </Text>
                      </View>
                    </View>

                    <View column align="flex-end" spacing="0.5rem">
                      {editingLabelConfigId === config.id ? (
                        <View row align="center" spacing="0.5rem">
                          <Button
                            icon="Save"
                            onClick={() => saveConfigLabel(config.id)}
                            disabled={!editingLabel.trim()}
                            colorOnHover={colors.custom.blue}
                          />

                          <Button
                            icon="Close"
                            onClick={clearLabelEditing}
                            colorOnHover={colors.custom.grey}
                          />
                        </View>
                      ) : (
                        <Button
                          icon="Edit"
                          onClick={() => editConfigLabel(config)}
                          colorOnHover={colors.custom.blue}
                        />
                      )}

                      <Button
                        icon="Delete"
                        onClick={() => deleteConfig(config.id)}
                        colorOnHover={colors.custom.red}
                      />
                    </View>
                  </Card>
                ))
              ) : (
                <CenteredText text="No Saved Configs" color={colors.custom.lightGrey} />
              )}
            </View>

            <Pagination
              count={store.pageCount}
              page={store.page}
              isLoading={store.isPageCountLoading}
              onChange={(page) => store.loadFiltered({ page })}
              onFullLoad={() => store.loadFiltered({ withFullCount: true })}
              siblingCount={2}
            />
          </View>
        </Modal.Content>

        <Modal.Footer>
          <Button text="Close" icon="Close" onClick={onClose} color={colors.custom.grey} />
        </Modal.Footer>

        {overwriteConfig && (
          <ConfirmModal
            headerText="Overwrite Saved Config"
            subText={`Overwrite "${overwriteConfig.label}" for this folder path?`}
            confirmText="Overwrite"
            setVisible={(visible) => !visible && setOverwriteConfig(null)}
            onConfirm={confirmOverwrite}
          >
            <Text color={colors.custom.lightGrey}>{overwriteConfig.folderPath}</Text>
          </ConfirmModal>
        )}
      </Modal.Container>
    );
  },
);

const SavedImportConfigsFilterMenu = Comp(({ store }: { store: SavedImportConfigSearch }) => (
  <FilterMenu store={store} color={colors.foreground} sortOptions={SORT_OPTIONS.SavedImportConfig}>
    <Card column spacing="0.5rem" width="30rem">
      <Input header="Label" value={store.label} setValue={store.setLabel} />

      <Input header="Folder Path" value={store.folderPath} setValue={store.setFolderPath} />
    </Card>
  </FilterMenu>
));

const getEditorRootPath = (store: Ingester | Reingester) => {
  const pathParts = store?.rootFolderPath?.split(path.sep) ?? [];
  return pathParts.slice(0, Math.min(store.rootFolderIndex + 1, pathParts.length)).join(path.sep);
};

const getEditorConfigPath = (store: Ingester | Reingester) =>
  store?.rootFolderPath ? path.join(getEditorRootPath(store), "*") : "";

const getDefaultConfigLabel = (store: Ingester | Reingester) =>
  store?.rootFolderPath ? path.basename(getEditorRootPath(store)) || getEditorRootPath(store) : "";

const getSaveFolderPath = (folderPath: string) => {
  const trimmedFolderPath = folderPath.trim();
  return path.basename(path.normalize(trimmedFolderPath)) === "*"
    ? trimmedFolderPath
    : path.join(trimmedFolderPath, "*");
};

const formatDate = (date: string) => (date ? dayjs(date).format("MMM D, YYYY h:mm A") : "Unknown");
