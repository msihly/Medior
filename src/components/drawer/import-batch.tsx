import { useState } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { colors, LinearProgress } from "@mui/material";
import { BatchTooltip, Icon, IconButton, Import, IMPORT_STATUSES, Text, View } from "components";
import { makeClasses } from "utils";
import { toast } from "react-toastify";

interface ImportBatchProps {
  createdAt: string;
}

export const ImportBatch = observer(({ createdAt }: ImportBatchProps) => {
  const { homeStore, importStore } = useStores();

  const batch = importStore.getByCreatedAt(createdAt);
  const completedFileIds = batch.completed.map((imp) => imp.fileId);
  const status = IMPORT_STATUSES[batch.status];

  const [expanded, setExpanded] = useState(false);

  const { css } = useClasses({ expanded, hasTags: batch.tagIds?.length > 0 });

  const handleTag = () => {
    homeStore.setTaggerBatchId(batch.id);
    homeStore.setTaggerFileIds([...completedFileIds]);
    homeStore.setIsTaggerOpen(true);
  };

  const handleDelete = async () => {
    const res = await importStore.deleteImportBatch({ id: batch.id });
    if (!res.success) toast.error(`Error deleting import batch: ${res?.error}`);
    else toast.success("Import batch deleted");
  };

  const toggleOpen = () => setExpanded(!expanded);

  return (
    <View column className={css.root}>
      <View row className={css.header}>
        <View row onClick={toggleOpen} className={css.headerButton}>
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

              <Icon name="ChevronRight" rotation={90} margins={{ right: "0.5rem" }} />
            </View>
          </View>
        </View>

        <IconButton
          name="Label"
          onClick={handleTag}
          disabled={batch.status === "PENDING"}
          iconProps={{ color: colors.grey["300"], size: "0.9em" }}
        />

        <IconButton
          name="Delete"
          onClick={handleDelete}
          iconProps={{ color: colors.red["700"], size: "0.9em" }}
        />
      </View>

      {expanded && batch.imports?.length > 0 && (
        <View column className={css.imports}>
          {batch.imports.map((imp) => (
            <Import key={imp.path} fileImport={imp} />
          ))}
        </View>
      )}
    </View>
  );
});

const useClasses = makeClasses((_, { expanded, hasTags }) => ({
  header: {
    borderRadius: expanded ? "0.5rem 0.5rem 0 0" : "0.5rem",
    padding: "0.2rem",
    backgroundColor: colors.grey["900"],
  },
  headerButton: {
    flex: 1,
    "&:hover": { cursor: "pointer" },
  },
  headerCenter: {
    display: "flex",
    flex: 1,
    flexDirection: "column",
    width: 0,
  },
  index: {
    justifyContent: "center",
    alignSelf: "center",
    paddingLeft: "0.5em",
    fontSize: "0.8em",
    textAlign: "center",
    textShadow: `0px 0px 5px ${colors.blue["700"]}`,
  },
  imports: {
    borderRadius: "0 0 0.5rem 0.5rem",
    padding: "0.5rem",
    maxHeight: "15rem",
    backgroundColor: colors.grey["900"],
    overflowY: "auto",
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
    marginBottom: "0.5rem",
    width: "100%",
  },
  statusIcon: {
    borderRadius: "0.5rem 0 0 0.5rem",
    padding: "0 0.5rem",
  },
  tag: {
    cursor: "pointer",
  },
  tags: {
    margin: "0.4rem 0.3rem 0.2rem",
  },
}));
