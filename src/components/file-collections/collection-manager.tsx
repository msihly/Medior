import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { TagOption, useStores } from "store";
import { Button, CenteredText, FileCard, Input, Modal, TagInput, Text, View } from "components";
import { FileCollection } from ".";
import { colors, makeClasses } from "utils";
import { toast } from "react-toastify";

export const FileCollectionManager = observer(() => {
  const { css } = useClasses(null);

  const { fileCollectionStore } = useStores();

  const hasAnySelected = fileCollectionStore.selectedFileIds.length > 0;
  const hasOneSelected = fileCollectionStore.selectedFiles.length === 1;
  const currentCollections = hasOneSelected
    ? fileCollectionStore.listByFileId(fileCollectionStore.selectedFileIds[0])
    : [];

  const [tagSearchValue, setTagSearchValue] = useState<TagOption[]>([]);
  const [titleSearchValue, setTitleSearchValue] = useState("");

  useEffect(() => {
    fileCollectionStore.loadSelectedFiles();
  }, [fileCollectionStore.selectedFileIds]);

  const filteredCollections = useMemo(() => {
    const searchStr = titleSearchValue.toLowerCase();
    return fileCollectionStore.collections.filter((c) => c.title.toLowerCase().includes(searchStr));
  }, [fileCollectionStore.collections.toString(), tagSearchValue, titleSearchValue]);

  const closeModal = () => fileCollectionStore.setIsCollectionManagerOpen(false);

  const handleNewCollection = async () => {
    const res = await fileCollectionStore.createCollection({
      fileIdIndexes: fileCollectionStore.selectedFileIds.map((id, index) => ({
        fileId: id,
        index,
      })),
      title: "Untitled Collection",
    });

    if (!res.success) toast.error(res.error);
    else {
      fileCollectionStore.setActiveCollectionId(res.data.id);
      fileCollectionStore.setIsCollectionEditorOpen(true);
    }
  };

  return (
    <Modal.Container height="100%" width="100%" onClose={closeModal}>
      <Modal.Header>
        <Text>{"Manage Collections"}</Text>
      </Modal.Header>

      <Modal.Content>
        {!hasAnySelected ? null : hasOneSelected ? (
          <View row>
            <View className={css.leftColumn}>
              <Text className={css.sectionTitle}>{"Selected File"}</Text>

              <View className={css.container}>
                {fileCollectionStore.selectedFiles.length > 0 ? (
                  <FileCard
                    file={fileCollectionStore.selectedFiles[0]}
                    height="13rem"
                    width="12rem"
                    disabled
                  />
                ) : (
                  <CenteredText text="Loading selected file..." />
                )}
              </View>
            </View>

            <View column flex={1}>
              <View row justify="center">
                <Text className={css.sectionTitle}>{"Current Collections"}</Text>
              </View>

              <View className={css.container}>
                {currentCollections.length > 0 ? (
                  currentCollections.map((c) => (
                    <FileCollection key={c.id} id={c.id} width="12rem" height="14rem" />
                  ))
                ) : (
                  <CenteredText text="No collections found" />
                )}
              </View>
            </View>
          </View>
        ) : (
          <View column>
            <Text className={css.sectionTitle}>{"Selected Files"}</Text>

            <View className={css.container}>
              {fileCollectionStore.selectedFiles.length > 0 ? (
                fileCollectionStore.selectedFiles.map((f) => (
                  <FileCard key={f.id} file={f} width="12rem" height="14rem" disabled />
                ))
              ) : (
                <CenteredText text="Loading selected files..." />
              )}
            </View>
          </View>
        )}

        <View row margins={{ top: "0.5rem" }}>
          <View className={css.leftColumn}>
            <Text className={css.sectionTitle}>{"Search"}</Text>

            <View column className={css.container}>
              <Input
                label="Search Titles"
                value={titleSearchValue}
                setValue={setTitleSearchValue}
                fullWidth
                margins={{ bottom: "0.5rem" }}
              />

              <TagInput
                label="Search Tags"
                value={tagSearchValue}
                onChange={setTagSearchValue}
                fullWidth
                hasSearchMenu
              />
            </View>
          </View>

          <View column flex={1}>
            <Text className={css.sectionTitle}>{"All Collections"}</Text>

            <View className={css.container}>
              {filteredCollections.length > 0 ? (
                filteredCollections.map((c) => (
                  <FileCollection key={c.id} id={c.id} width="12rem" height="14rem" />
                ))
              ) : (
                <CenteredText text="No collections found" />
              )}
            </View>
          </View>
        </View>
      </Modal.Content>

      <Modal.Footer>
        <Button text="Close" icon="Close" onClick={closeModal} color={colors.grey["700"]} />

        <Button
          text="New Collection"
          icon="Add"
          onClick={handleNewCollection}
          color={colors.blueGrey["700"]}
        />
      </Modal.Footer>
    </Modal.Container>
  );
});

const useClasses = makeClasses({
  container: {
    display: "flex",
    flexFlow: "row wrap",
    borderRadius: "0.3rem",
    padding: "0.5rem",
    minHeight: "15rem",
    height: "100%",
    width: "100%",
    backgroundColor: colors.grey["800"],
    overflow: "auto",
  },
  leftColumn: {
    display: "flex",
    flexDirection: "column",
    width: "13rem",
    marginRight: "0.5rem",
  },
  sectionTitle: {
    alignSelf: "center",
    margin: "0.2rem 0",
    fontSize: "0.8em",
    textShadow: `0 0 10px ${colors.blue["600"]}`,
  },
});
