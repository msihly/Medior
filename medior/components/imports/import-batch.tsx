import path from "path";
import { useState } from "react";
import { FileImportBatch, observer, useStores } from "medior/store";
import { LinearProgress } from "@mui/material";
import { Icon, IconButton, Text, View } from "medior/components";
import { BatchTooltip, ImportCardRow, IMPORT_STATUSES } from ".";
import { colors, formatBytes, makeClasses } from "medior/utils";
import { toast } from "react-toastify";
import Color from "color";

interface ImportBatchProps {
  batch: FileImportBatch;
}

export const ImportBatch = observer(({ batch }: ImportBatchProps) => {
  const stores = useStores();

  const index = stores.import.batches.findIndex((b) => b.id === batch.id);
  const status = IMPORT_STATUSES[batch.status];

  const [expanded, setExpanded] = useState(false);

  const { css } = useClasses({ expanded, hasTags: batch.tagIds?.length > 0, status: batch.status });

  const handleCollections = async () => {
    const res = await stores.collection.editor.loadCollection({ id: batch.collectionId });
    if (!res.success) toast.error(`Error loading collection: ${res.error}`);
    else stores.collection.editor.setIsOpen(true);
  };

  const handleDelete = async () => {
    const res = await stores.import.deleteImportBatches({ ids: [batch.id] });
    if (!res.success) toast.error(`Error deleting import batch: ${res.error}`);
    else toast.success("Import batch deleted");
  };

  const handleTag = () => {
    stores.tag.setFileTagEditorBatchId(batch.id);
    stores.tag.setFileTagEditorFileIds([...batch.completed.map((imp) => imp.fileId)]);
    stores.tag.setIsFileTagEditorOpen(true);
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
            <Text preset="label-glow" className={css.index}>{`${index + 1}.`}</Text>

            <BatchTooltip batch={batch}>
              <Icon name={status.icon} color={status.color} className={css.statusIcon} />
            </BatchTooltip>

            <View className={css.headerCenter}>
              <View row className={css.progressContainer}>
                <Text className={css.progressText}>
                  {`${batch.imported.length} / `}
                  <Text color={colors.custom.lightGrey}>{batch.imports.length}</Text>
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
              iconProps={{
                color: Color(colors.custom.lightGrey)
                  .fade(!batch.collectionId ? 0.5 : 0)
                  .string(),
                size: "0.9em",
              }}
            />

            <IconButton
              name="Label"
              onClick={handleTag}
              disabled={batch.status === "PENDING"}
              iconProps={{
                color: Color(colors.custom.lightGrey)
                  .fade(batch.status === "PENDING" ? 0.5 : 0)
                  .string(),
                size: "0.9em",
              }}
            />
          </View>

          <View row justify="space-between">
            <View />

            <IconButton
              name="Delete"
              onClick={handleDelete}
              iconProps={{ color: colors.custom.red, size: "0.9em" }}
            />
          </View>
        </View>
      </View>

      {expanded && batch.imports?.length > 0 && (
        <View column spacing="0.3rem" className={css.importCards}>
          {batch.status === "PENDING" && <ImportStats />}

          <ImportCardRow {...{ batch, status: "PENDING" }} />
          <ImportCardRow {...{ batch, status: "COMPLETE" }} />
          <ImportCardRow {...{ batch, status: "ERROR" }} />
          <ImportCardRow {...{ batch, status: "DUPLICATE" }} />
          <ImportCardRow {...{ batch, status: "DELETED" }} />
        </View>
      )}
    </View>
  );
});

const ImportStats = observer(() => {
  const { css } = useClasses(null);

  const stores = useStores();

  return (
    <View column>
      <View row spacing="1rem">
        <View row align="center" spacing="0.5rem">
          <Text width="5.5rem">{formatBytes(stores.import.importStats.completedBytes)}</Text>
          <Text>{"/"}</Text>
          <Text color={colors.custom.lightGrey} width="5.5rem">
            {formatBytes(stores.import.importStats.totalBytes)}
          </Text>
        </View>

        <LinearProgress
          variant="determinate"
          value={
            (stores.import.importStats.completedBytes / stores.import.importStats.totalBytes) * 100
          }
          className={css.progressBar}
        />

        <View width="3rem" />
      </View>

      <Text fontSize="0.8em" color={colors.custom.grey}>
        {`${formatBytes(stores.import.importStats.rateInBytes)}/s`}
      </Text>
    </View>
  );
});

interface ClassesProps {
  expanded: boolean;
  hasTags: boolean;
  status: FileImportBatch["status"];
}

const useClasses = makeClasses((props: ClassesProps) => ({
  folderPath: {
    color: colors.custom.lightGrey,
    fontSize: "0.9em",
    textOverflow: "ellipsis",
    overflow: "hidden",
    whiteSpace: "nowrap",
  },
  header: {
    borderRadius: props?.expanded ? "0.4rem 0.4rem 0 0" : "0.4rem",
    backgroundColor: colors.background,
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
    overflow: "hidden",
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
    backgroundColor: colors.custom.black,
  },
  index: {
    justifyContent: "center",
    alignSelf: "center",
    paddingLeft: "0.5em",
  },
  importCards: {
    borderRadius: "0 0 0.5rem 0.5rem",
    padding: "0.5rem",
    width: "-webkit-fill-available",
    backgroundColor: colors.background,
  },
  progressBar: {
    flex: 1,
    margin: "0 0.5rem",
    backgroundColor: Color(colors.custom.blue).fade(0.5).string(),
    "& .MuiLinearProgress-bar": {
      backgroundColor: props?.status !== "PENDING" ? colors.custom.green : colors.custom.blue,
    },
  },
  progressContainer: {
    flex: 1,
    alignItems: "center",
    width: "100%",
    margin: props?.hasTags ? "0.2rem 0.3rem 0.4rem" : "0.3rem",
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
