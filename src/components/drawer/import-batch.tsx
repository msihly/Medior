import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { colors, LinearProgress } from "@mui/material";
import { Accordion, IconButton, Import, Tag, Text, View } from "components";
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

  const [expanded, setExpanded] = useState(false);

  const handleDelete = async () => {
    await deleteImportBatch(importStore, addedAt);
    toast.success("Import batch deleted");
  };

  const { classes: css } = useClasses(null);

  return (
    <View className={css.card}>
      <Accordion
        {...{ expanded, setExpanded }}
        header={
          <View className={css.header} column>
            <View>
              <Text bold color={colors.green["700"]} className={css.batchStatus}>
                {isCompleted ? "Completed" : "Importing"}
              </Text>
              <Text>{`${batch.imported.length} / ${batch.imports.length}`}</Text>
            </View>

            <View>
              {batch.tagIds.map((id) => (
                <Tag key={id} id={id} />
              ))}
            </View>

            {batch.nextImport && (
              <Text noWrap fontSize={12}>
                {batch.nextImport?.path}
              </Text>
            )}

            <LinearProgress
              variant="determinate"
              value={(batch.imported.length / batch.imports.length) * 100}
              className={css.progress}
            />
          </View>
        }
        className={css.accordion}
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

const useClasses = makeClasses({
  accordion: {
    width: "90%",
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
    borderRadius: "0 0.5rem 0.5rem 0",
    backgroundColor: colors.grey["700"],
    "&:hover": {
      backgroundColor: colors.red["900"],
    },
  },
  header: {
    width: "100%",
  },
  imports: {
    padding: "0.5rem",
  },
});
