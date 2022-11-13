import { ipcRenderer } from "electron";
import { useEffect } from "react";
import Mongoose from "mongoose";
import { getAllImportBatches, useFileImportQueue, watchImportBatchModel } from "database";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { CONSTANTS } from "utils";

export const ImportWorker = observer(() => {
  const { importStore } = useStores();

  useEffect(() => {
    document.title = "Import Worker";
    console.debug("Import worker useEffect fired.");

    const loadDatabase = async () => {
      try {
        const databaseUri = await ipcRenderer.invoke("getDatabaseUri");
        console.debug("Connecting to database:", databaseUri, "...");

        await Mongoose.connect(databaseUri, CONSTANTS.MONGOOSE_OPTS);
        console.debug("Connected to database. Retrieving data...");

        const importBatches = await getAllImportBatches();
        console.debug("Data retrieved. Storing in MobX...");

        importStore.overwrite(importBatches);
        console.debug("Data stored in MobX.");

        watchImportBatchModel(importStore);
      } catch (err) {
        console.error(err);
      }
    };

    loadDatabase();
  }, []);

  useFileImportQueue();

  return null;
});
