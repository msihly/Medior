import path from "path";
import { useEffect, useState } from "react";
import {
  Button,
  Card,
  CenteredText,
  Comp,
  ConfirmModal,
  Input,
  Modal,
  Pagination,
  SearchLoadingOverlay,
  Text,
  View,
} from "medior/components";
import { formatDate } from "medior/components/drawer/activity-meta";
import { Ingester, Reingester, SavedImportConfig, useStores } from "medior/store";
import { normalizeImportConfigPath } from "medior/store/saved-import-config";
import { colors, toast } from "medior/utils/client";
import { SavedImportConfigsFilterMenu } from "./saved-import-configs-filter-menu";

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
    const [editingLabel, setEditingLabel] = useState("");
    const [editingLabelConfigId, setEditingLabelConfigId] = useState("");
    const [isSaving, setIsSaving] = useState(false);
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

    const handleClose = () => {
      if (!isSaving) {
        store.cancelLoad();
        onClose();
      }
    };

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
      else saveConfig();
    };

    const saveConfig = async (id?: string) => {
      setIsSaving(true);

      try {
        if (!editorStore?.rootFolderPath) {
          throw new Error("Open the Import Editor with a loaded folder first");
        }

        const folderPath = getSaveFolderPath(configFolderPath);
        const res = await stores.import.saveSavedConfig({
          folderPath,
          id,
          label: configLabel.trim() || getDefaultConfigLabel(editorStore),
          options: editorStore.options.toSavedConfig(),
        });

        if (!res.success) throw new Error(res.error);

        await refreshConfigs();
        resetEditorConfig();
        setOverwriteConfig(null);
        toast.success("Saved import config saved");

        return true;
      } catch (err) {
        toast.error(err?.message ?? "Failed to save import config");

        return false;
      } finally {
        setIsSaving(false);
      }
    };

    const confirmOverwrite = async () => saveConfig(overwriteConfig.id);

    const deleteConfig = async (id: string) => {
      setIsSaving(true);

      try {
        const res = await stores.import.deleteSavedConfig(id);

        if (!res.success) throw new Error(res.error);

        await refreshConfigs();

        if (editingLabelConfigId === id) clearLabelEditing();

        toast.warn("Saved import config deleted");
      } catch (err) {
        toast.error(err?.message ?? "Failed to delete import config");
      } finally {
        setIsSaving(false);
      }
    };

    const saveConfigLabel = async (id: string) => {
      setIsSaving(true);

      try {
        const res = await stores.import.renameSavedConfig({ id, label: editingLabel.trim() });

        if (!res.success) throw new Error(res.error);

        await refreshConfigs();
        clearLabelEditing();

        toast.success("Saved import config label updated");
      } catch (err) {
        toast.error(err?.message ?? "Failed to update import config label");
      } finally {
        setIsSaving(false);
      }
    };

    return (
      <Modal.Container
        isLoading={isSaving}
        onClose={handleClose}
        width="60rem"
        maxWidth="95%"
        height="90%"
      >
        <Modal.Header leftNode={<SavedImportConfigsFilterMenu store={store} />}>
          <Text preset="title">{"Saved Import Configs"}</Text>
        </Modal.Header>

        <Modal.Content dividers={false} padding={{ all: 0 }}>
          <View column height="100%" overflow="hidden" position="relative">
            <SearchLoadingOverlay store={store} />

            <View column flex={1} minHeight={0} spacing="0.8rem" padding={{ all: "0.2rem 1rem" }}>
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

              <View column flex={1} overflow="hidden auto" spacing="0.5rem">
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
                            {`Created: ${config.dateCreated ? formatDate(config.dateCreated) : "Unknown"}`}
                          </Text>

                          <Text color={colors.custom.lightGrey} fontSize="0.7em">
                            {`Modified: ${config.dateModified ? formatDate(config.dateModified) : "Unknown"}`}
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
            </View>

            <Pagination
              inline
              count={store.pageCount}
              page={store.page}
              isLoading={store.isPageCountLoading && !store.isLoading}
              onChange={(page) => store.loadFiltered({ page })}
              onFullLoad={() => store.loadFiltered({ toLastPage: true })}
              siblingCount={2}
            />
          </View>
        </Modal.Content>

        <Modal.Footer>
          <Button text="Close" icon="Close" onClick={handleClose} color={colors.custom.grey} />
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
