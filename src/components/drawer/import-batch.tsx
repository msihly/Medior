import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { colors, LinearProgress } from "@mui/material";
import {
  Icon,
  IconButton,
  Import,
  IMPORT_STATUSES,
  SideScroller,
  Tag,
  Text,
  View,
} from "components";
import { makeClasses } from "utils";
import { useState } from "react";
import { deleteImportBatch } from "database";
import { toast } from "react-toastify";

interface ImportBatchProps {
  addedAt: string;
}

export const ImportBatch = observer(({ addedAt }: ImportBatchProps) => {
  const { importStore } = useStores();

  const batch = importStore.getByAddedAt(addedAt);
  const status = IMPORT_STATUSES[batch.status];

  const [expanded, setExpanded] = useState(false);
  const { css } = useClasses({ expanded, hasTags: batch.tagIds?.length > 0 });

  const handleDelete = async () => {
    await deleteImportBatch(importStore, addedAt);
    toast.success("Import batch deleted");
  };

  const toggleOpen = () => setExpanded(!expanded);

  return (
    <View column className={css.root}>
      <View row className={css.header}>
        <View row onClick={toggleOpen} className={css.headerButton}>
          <Icon name={status.icon} color={status.color} className={css.statusIcon} />

          <View className={css.headerCenter}>
            {batch.tagIds?.length > 0 && (
              <SideScroller innerClassName={css.tags}>
                {batch.tagIds.map((id) => (
                  <Tag key={id} id={id} size="small" className={css.tag} />
                ))}
              </SideScroller>
            )}

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

        <IconButton name="Delete" onClick={handleDelete} className={css.deleteButton} />
      </View>

      {expanded && (
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
  deleteButton: {
    borderRadius: `0 0.5rem ${expanded ? "0" : "0.5rem"} 0`,
    backgroundColor: colors.grey["700"],
    "&:hover": { backgroundColor: colors.red["900"] },
  },
  header: {
    borderRadius: expanded ? "0.5rem 0.5rem 0 0" : "0.5rem",
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
    width: "20rem",
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
