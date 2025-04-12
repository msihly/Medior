import { useEffect } from "react";
import { Comp, SettingsModal, View } from "medior/components";
import { useStores } from "medior/store";
import { makeClasses } from "medior/utils/client";
import { useSockets, Views } from "./common";

export const HomeWindow = Comp(() => {
  const stores = useStores();

  const { css } = useClasses({ isDrawerOpen: stores.home.isDrawerOpen });

  useSockets({ view: "home" });

  useEffect(() => {
    (async () => {
      try {
        document.title = "Medior —— Home";
        await stores.file.search.loadFiltered({ page: 1 });
        stores.tag.loadTags();
        stores.import.manager.loadImportBatches();
      } catch (err) {
        console.error(err);
      }
    })();
  }, []);

  return (
    <Views.ImportDnD>
      <View column className={css.root}>
        <Views.Search hasImports hasSettings />

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
