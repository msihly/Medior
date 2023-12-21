import path from "path";
import { useState } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import AutoSizer from "react-virtualized-auto-sizer";
import { FixedSizeList } from "react-window";
import { LinearProgress } from "@mui/material";
import { BatchTooltip, Icon, IconButton, IMPORT_STATUSES, Text, View } from "components";
import { IMPORT_CARD_SIZE, ImportCard } from ".";
import { colors, makeClasses } from "utils";
import { toast } from "react-toastify";
import Color from "color";

interface ImportBatchProps {
  createdAt: string;
}

export const ImportBatch = observer(({ createdAt }: ImportBatchProps) => {
  const { fileCollectionStore, homeStore, importStore } = useStores();

  const batch = importStore.getByCreatedAt(createdAt);
  const completedFileIds = batch.completed.map((imp) => imp.fileId);
  const status = IMPORT_STATUSES[batch.status];

  const [expanded, setExpanded] = useState(false);

  const { css } = useClasses({ expanded, hasTags: batch.tagIds?.length > 0 });

  const handleCollections = () => {
    if (!fileCollectionStore.getById(batch.collectionId))
      return toast.error("Collection not found");
    fileCollectionStore.setActiveCollectionId(batch.collectionId);
    fileCollectionStore.setIsCollectionEditorOpen(true);
  };

  const handleDelete = async () => {
    const res = await importStore.deleteImportBatch({ id: batch.id });
    if (!res.success) toast.error(`Error deleting import batch: ${res?.error}`);
    else toast.success("Import batch deleted");
  };

  const handleTag = () => {
    homeStore.setTaggerBatchId(batch.id);
    homeStore.setTaggerFileIds([...completedFileIds]);
    homeStore.setIsTaggerOpen(true);
  };

  const toggleOpen = () => setExpanded(!expanded);

  return (
    <View column className={css.root}>
      <View row className={css.header}>
        <View onClick={toggleOpen} className={css.headerButton}>
          <View className={css.headerTop}>
            <Text className={css.folderPath}>
              {batch.imports[0]?.path && path.dirname(batch.imports[0].path)}
            </Text>

            <Icon name="ChevronRight" rotation={90} margins={{ right: "0.5rem" }} />
          </View>

          <View className={css.headerBottom}>
            <Text className={css.index}>
              {`${importStore.batches.findIndex((b) => b.createdAt === createdAt) + 1}.`}
            </Text>

            <BatchTooltip batch={batch}>
              <Icon name={status.icon} color={status.color} className={css.statusIcon} />
            </BatchTooltip>

            <View className={css.headerCenter}>
              <View row className={css.progressContainer}>
                <Text className={css.progressText}>
                  {`${batch.imported.length} / `}
                  <Text color={colors.grey["500"]}>{batch.imports.length}</Text>
                </Text>

                <LinearProgress
                  variant="determinate"
                  value={(batch.imported.length / batch.imports.length) * 100}
                  className={css.progressBar}
                />
              </View>
            </View>
          </View>
        </View>

        <View column>
          <View row justify="space-between">
            <IconButton
              name="Collections"
              onClick={handleCollections}
              disabled={!batch.collectionId}
              iconProps={{ color: colors.grey["300"], size: "0.9em" }}
            />

            <IconButton
              name="Label"
              onClick={handleTag}
              disabled={batch.status === "PENDING"}
              iconProps={{
                color:
                  batch.status === "PENDING"
                    ? Color(colors.grey["300"]).fade(0.5).string()
                    : colors.grey["300"],
                size: "0.9em",
              }}
            />
          </View>

          <View row justify="space-between">
            <View />

            <IconButton
              name="Delete"
              onClick={handleDelete}
              iconProps={{ color: colors.red["700"], size: "0.9em" }}
            />
          </View>
        </View>
      </View>

      {expanded && batch.imports?.length > 0 && (
        <View className={css.importCards}>
          <AutoSizer disableHeight>
            {({ width }) => (
              <FixedSizeList
                layout="horizontal"
                width={width}
                height={IMPORT_CARD_SIZE}
                itemSize={IMPORT_CARD_SIZE}
                itemCount={batch.imports.length}
              >
                {({ index, style }) => (
                  <ImportCard key={index} fileImport={batch.imports[index]} style={style} />
                )}
              </FixedSizeList>
            )}
          </AutoSizer>
        </View>
      )}
    </View>
  );
});

const useClasses = makeClasses((_, { expanded, hasTags }) => ({
  folderPath: {
    color: colors.grey["300"],
    fontSize: "0.9em",
    textOverflow: "ellipsis",
    overflow: "hidden",
    whiteSpace: "nowrap",
  },
  header: {
    borderRadius: expanded ? "0.4rem 0.4rem 0 0" : "0.4rem",
    backgroundColor: colors.grey["900"],
  },
  headerBottom: {
    display: "flex",
    flexDirection: "row",
    flexBasis: "50%",
  },
  headerButton: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    "&:hover": { cursor: "pointer" },
  },
  headerCenter: {
    display: "flex",
    flex: 1,
    flexDirection: "column",
    width: 0,
  },
  headerTop: {
    display: "flex",
    flexDirection: "row",
    flexBasis: "50%",
    justifyContent: "space-between",
    borderTopLeftRadius: "0.4rem",
    padding: "0.3em 0.5em",
    backgroundColor: colors.darkGrey,
  },
  index: {
    justifyContent: "center",
    alignSelf: "center",
    paddingLeft: "0.5em",
    fontSize: "0.8em",
    textAlign: "center",
    textShadow: `0px 0px 5px ${colors.blue["700"]}`,
  },
  importCards: {
    display: "flex",
    flexDirection: "row",
    borderRadius: "0 0 0.5rem 0.5rem",
    padding: "0.5rem",
    width: "-webkit-fill-available",
    backgroundColor: colors.grey["900"],
    whiteSpace: "nowrap",
    overflowX: "auto",
  },
  progressBar: {
    flex: 1,
    margin: "0 0.5rem",
  },
  progressContainer: {
    flex: 1,
    alignItems: "center",
    width: "100%",
    margin: hasTags ? "0.2rem 0.3rem 0.4rem" : "0.3rem",
  },
  progressText: {
    fontSize: "0.9em",
    textAlign: "left",
  },
  root: {
    flex: "none",
    marginBottom: "0.5rem",
    width: "100%",
    overflow: "hidden",
  },
  statusIcon: {
    borderRadius: "0.5rem 0 0 0.5rem",
    padding: "0 0.5rem",
  },
}));
