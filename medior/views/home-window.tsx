import { useEffect, useState } from "react";
import { observer, useStores } from "medior/store";
import { SettingsModal, View } from "medior/components";
import { Views, useSockets } from "./common";
import { makeClasses, makePerfLog } from "medior/utils";

export const HomeWindow = observer(() => {
  const stores = useStores();

  const { css } = useClasses({ isDrawerOpen: stores.home.isDrawerOpen });

  const [isLoading, setIsLoading] = useState(true);

  useSockets({ view: "home" });

  useEffect(() => {
    document.title = "Medior // Home";

    const loadDatabase = async () => {
      try {
        const { perfLog, perfLogTotal } = makePerfLog("[Home]");

        await stores.file.search.loadFilteredFiles({ page: 1 });
        perfLog("Filtered files loaded");
        setIsLoading(false);

        await stores.tag.loadTags();
        perfLog("Tags loaded");

        await stores.import.loadImportBatches();
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

        {stores.home.settings.isOpen && <SettingsModal />}
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
