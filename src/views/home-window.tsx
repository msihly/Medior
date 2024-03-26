import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { SettingsModal, View } from "components";
import { Views, useSockets } from "./common";
import { makeClasses, makePerfLog } from "utils";

export const HomeWindow = observer(() => {
  const { homeStore, importStore, tagStore } = useStores();

  const { css } = useClasses({ isDrawerOpen: homeStore.isDrawerOpen });

  const [isLoading, setIsLoading] = useState(true);

  useSockets({ view: "home" });

  useEffect(() => {
    document.title = "Medior // Home";

    const loadDatabase = async () => {
      try {
        const { perfLog, perfLogTotal } = makePerfLog("[Home]");

        await homeStore.loadFilteredFiles({ page: 1 });
        perfLog("Filtered files loaded");
        setIsLoading(false);

        await tagStore.loadTags();
        perfLog("Tags loaded");

        await importStore.loadImportBatches();
        perfLog("Import batches loaded");

        perfLogTotal("Data loaded into MobX");
      } catch (err) {
        console.error(err);
      }
    };

    loadDatabase();
  }, []);

  return (
    <Views.ImportDnD>
      <View column className={css.root}>
        <Views.Search {...{ isLoading }} hasImports hasSettings />

        <Views.CollectionModals />

        <Views.FileModals />

        <Views.ImportModals />

        <Views.TagModals view="home" />

        {homeStore.isSettingsOpen && <SettingsModal />}
      </View>
    </Views.ImportDnD>
  );
});

const useClasses = makeClasses({
  root: {
    height: "100vh",
    overflow: "hidden",
  },
});
