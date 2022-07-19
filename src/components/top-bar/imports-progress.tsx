import { useEffect, useRef } from "react";
import { completeImportBatch, importFile, startImportBatch } from "database";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { colors } from "@mui/material";
import { Text, View } from "components";
import { makeClasses } from "utils";

const ImportsProgress = observer(() => {
  const rootStore = useStores();
  const { fileStore, importStore } = useStores();
  const { classes: css } = useClasses(null);

  const currentImportPath = useRef<string>(null);

  useEffect(() => {
    const handlePhase = async () => {
      if (importStore.activeBatch?.nextImport) {
        if (!importStore.isImporting)
          await startImportBatch(importStore, importStore.activeBatch?.addedAt);

        if (currentImportPath.current === importStore.activeBatch?.nextImport?.path) return;
        currentImportPath.current = importStore.activeBatch?.nextImport?.path;

        await importFile(
          rootStore,
          importStore.activeBatch?.addedAt,
          importStore.activeBatch?.nextImport
        );
      } else if (importStore.isImporting) {
        await completeImportBatch(importStore, importStore.activeBatch?.addedAt);
        currentImportPath.current = null;
      }
    };

    handlePhase();
  }, [importStore.activeBatch?.nextImport, importStore.isImporting]); // eslint-disable-line

  return importStore.isImporting ? (
    <View column>
      <Text className={css.title}>
        <Text className={css.title} bold>
          {"Importing: "}
        </Text>
        {`${importStore.completedBatches.length + 1} of ${importStore.importBatches.length}`}
      </Text>

      <Text className={css.subtitle}>
        <Text className={css.subtitle} bold>
          {"Total Completed: "}
        </Text>
        {importStore.completedBatches.length}
      </Text>
    </View>
  ) : (
    <View column>
      <Text className={css.title}>
        <Text className={css.title} bold>
          {"Total Files: "}
        </Text>
        {fileStore.files.length}
      </Text>

      <Text className={css.subtitle}>
        <Text className={css.subtitle} bold>
          {"Images: "}
        </Text>
        {fileStore.images.length}{" "}
        <Text className={css.subtitle} bold>
          {"Videos: "}
        </Text>
        {fileStore.videos.length}
      </Text>
    </View>
  );
});

export default ImportsProgress;

const useClasses = makeClasses({
  subtitle: {
    color: colors.grey["500"],
    fontSize: 13,
  },
  title: {
    color: colors.grey["300"],
    fontSize: 14,
  },
});
