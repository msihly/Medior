import { useEffect } from "react";
import { sleep } from "trabecula/utils/common";
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
        await stores.file.search.loadFiltered({ noCache: true, page: 1 });
        await sleep(2000);
        await stores.import.manager.runImporter();
      } catch (err) {
        console.error(err);
      }
    })();
  }, []);

  return (
    <Views.ImportDnD>
      <View column className={css.root}>
        <Views.Search isHome />

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
