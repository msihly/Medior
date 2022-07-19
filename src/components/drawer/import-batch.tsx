import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { colors, LinearProgress } from "@mui/material";
import { Accordion, Icon, IconButton, Import, IMPORT_STATUSES, Tag, Text, View } from "components";
import { makeClasses } from "utils";
import { useState } from "react";
import { deleteImportBatch } from "database";
import { toast } from "react-toastify";

interface ImportBatchProps {
  addedAt: string;
}

const ImportBatch = observer(({ addedAt }: ImportBatchProps) => {
  const { importStore } = useStores();

  const batch = importStore.getByAddedAt(addedAt);
  const isCompleted = batch.completedAt?.length > 0;
  const status = IMPORT_STATUSES[isCompleted ? "COMPLETE" : "PENDING"];

  const [expanded, setExpanded] = useState(false);

  const handleDelete = async () => {
    await deleteImportBatch(importStore, addedAt);
    toast.success("Import batch deleted");
  };

  const { classes: css } = useClasses({ expanded });

  return (
    <View row className={css.card}>
      <Icon name={status.icon} color={status.color} className={css.statusIcon} />

      <Accordion
        {...{ expanded, setExpanded }}
        className={css.accordion}
        header={
          <View className={css.header} column>
            <Text
              className={css.progress}
            >{`${batch.imported.length} / ${batch.imports.length}`}</Text>

            <View>
              {batch.tagIds.map((id) => (
                <Tag key={id} id={id} />
              ))}
            </View>

            <LinearProgress
              variant="determinate"
              value={(batch.imported.length / batch.imports.length) * 100}
              className={css.progress}
            />
          </View>
        }
      >
        <View column className={css.imports}>
          {batch.imports.map((imp) => (
            <Import key={imp.path} fileImport={imp} />
          ))}
        </View>
      </Accordion>

      <IconButton name="Delete" onClick={handleDelete} className={css.deleteButton} />
    </View>
  );
});

export default ImportBatch;

const useClasses = makeClasses((_, { expanded }) => ({
  accordion: {
    flex: 1,
    width: 0,
    "& > button": {
      padding: "0 0.5rem",
      height: "2.5rem",
    },
  },
  batchStatus: {
    marginRight: "1em",
  },
  card: {
    borderRadius: "0.5rem",
    marginBottom: "0.5rem",
    width: "20rem",
    backgroundColor: colors.grey["900"],
  },
  deleteButton: {
    borderRadius: `0 0.5rem ${expanded ? "0" : "0.5rem"} 0`,
    backgroundColor: colors.grey["700"],
    "&:hover": {
      backgroundColor: colors.red["900"],
    },
    height: "2.5rem",
  },
  header: {
    width: "100%",
  },
  imports: {
    margin: "0 -2rem",
    padding: "0.5rem",
  },
  progress: {
    marginBottom: "0.3em",
    fontSize: "0.8em",
    textAlign: "left",
  },
  statusIcon: {
    borderRadius: "0.5rem 0 0 0.5rem",
    padding: "0 0.5rem",
    height: "2.5rem",
  },
}));
