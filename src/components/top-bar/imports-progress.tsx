import { useEffect } from "react";
import { copyFileTo } from "database";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { FileImport } from "store/files/file-store";
import { colors } from "@mui/material";
import { Text, View } from "components";
import { makeStyles } from "utils";
import { OUTPUT_DIR } from "env";

const ImportsProgress = observer(() => {
  const { fileStore } = useStores();
  const { classes: css } = useClasses();

  useEffect(() => {
    const importFile = async (fileObj: FileImport) => {
      fileStore.setIsImporting(true);

      const res = await copyFileTo(fileObj, OUTPUT_DIR);
      if (!res?.success) console.error(res?.error);
      res?.isDuplicate ? fileStore.addDuplicates([res?.file]) : fileStore.addFiles([res?.file]);

      fileStore.completeImport(fileObj.path);
    };

    if (!fileStore.isImporting && fileStore.hasIncompleteImports)
      importFile(fileStore.imports.find((imp) => !imp.isCompleted));
  }, [fileStore, fileStore.completedImports, fileStore.imports, fileStore.isImporting]);

  return fileStore.hasIncompleteImports ? (
    <View column>
      <Text className={css.title}>
        <Text className={css.title} bold>
          Importing:
        </Text>
        {` ${fileStore.completedImports.length + 1} of ${fileStore.imports.length}`}
      </Text>

      <Text className={css.subtitle}>
        <Text className={css.subtitle} bold>
          Total Completed:
        </Text>
        {` ${fileStore.completedImports.length}`}
      </Text>
    </View>
  ) : (
    <View column>
      <Text className={css.title}>
        <Text className={css.title} bold>
          Total Files:
        </Text>
        {` ${fileStore.files.length}`}
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

const useClasses = makeStyles()({
  subtitle: {
    color: colors.grey["500"],
    fontSize: 13,
  },
  title: {
    color: colors.grey["300"],
    fontSize: 14,
  },
});
