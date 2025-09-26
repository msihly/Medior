import path from "path";
import { Button, Card, Chip, Comp, ConfirmModal, Modal, Text, View } from "medior/components";
import { useImporter, useStores } from "medior/store";
import { colors, makeClasses } from "medior/utils/client";
import { commas, formatBytes } from "medior/utils/common";
import { ImportFoldersList, ImportOptions, RootFolderButton, TagHierarchy } from ".";

export const ImportEditor = Comp(() => {
  const { css } = useClasses(null);

  const stores = useStores();
  const store = stores.import.editor;
  const options = stores.import.editor.options;

  const { confirm, scan } = useImporter();

  const totalBytes = store.imports.reduce((acc, cur) => acc + cur.size, 0);

  const confirmDiscard = async () => {
    store.setIsOpen(false);
    return true;
  };

  const handleCancel = () => store.setIsConfirmDiscardOpen(true);

  const handleTagManager = () => {
    if (stores.tag.manager.isOpen) stores.tag.manager.setIsOpen(false);
    setTimeout(() => stores.tag.manager.setIsOpen(true), 0);
  };

  return (
    <Modal.Container isLoading={store.isDisabled} width="100%" height="100%">
      <Modal.Header
        leftNode={<Button text="Tag Manager" icon="More" onClick={handleTagManager} />}
        rightNode={
          <View row spacing="0.3rem">
            <Chip label={formatBytes(totalBytes)} />
            <Chip label={`${commas(store.flatFolderHierarchy.size)} Folders`} />
            <Chip label={`${commas(store.imports.length)} Files`} />
          </View>
        }
      >
        <Text preset="title">{"Import Editor"}</Text>
      </Modal.Header>

      <Modal.Content row column={false} flex={1} height="100%" width="100%">
        <Card width="17rem" overflow="hidden auto">
          <ImportOptions scan={scan} />
        </Card>

        <View column width="100%" spacing="0.5rem" overflow="hidden">
          {(options.folderToTagsMode !== "none" ||
            options.folderToCollectionMode === "withTag" ||
            (options.withDiffusionParams && options.withDiffusionTags)) && (
            <Card width="100%">
              <View className={css.rootTagSelector}>
                <Text fontWeight={500} fontSize="0.9em" marginRight="0.5rem">
                  {"Select Root Tag"}
                </Text>

                {[...store.rootFolderPath.split(path.sep), "*"].map((p, i) => (
                  <RootFolderButton key={i} index={i} folderPart={p} />
                ))}
              </View>

              <View className={css.tags}>
                {store.tagHierarchy.map((t) => (
                  <TagHierarchy key={t.label} tag={t} />
                ))}
              </View>
            </Card>
          )}

          <ImportFoldersList flatFolderHierarchy={store.flatFolderHierarchy} />
        </View>
      </Modal.Content>

      <Modal.Footer>
        <Button
          text="Cancel"
          icon="Delete"
          onClick={handleCancel}
          disabled={store.isDisabled}
          colorOnHover={colors.custom.red}
        />

        <Button
          text="Confirm"
          icon="Check"
          onClick={confirm}
          disabled={store.isDisabled || store.hasChangesSinceLastScan}
          color={colors.custom.blue}
        />
      </Modal.Footer>

      {store.isConfirmDiscardOpen && (
        <ConfirmModal
          headerText="Discard Changes"
          subText="Are you sure you want to cancel importing?"
          setVisible={store.setIsConfirmDiscardOpen}
          onConfirm={confirmDiscard}
        />
      )}
    </Modal.Container>
  );
});

const useClasses = makeClasses({
  rootTagSelector: {
    display: "flex",
    flexFlow: "row wrap",
    alignItems: "center",
    marginBottom: "0.3rem",
  },
  tags: {
    display: "flex",
    flexDirection: "row",
    maxHeight: "35vh",
    overflowX: "auto",
  },
});
