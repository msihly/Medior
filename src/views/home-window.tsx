import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { View } from "components";
import { Views, useSockets } from "./common";
import { makeClasses } from "utils";

export const HomeWindow = observer(() => {
  const { fileCollectionStore, homeStore, importStore, tagStore } = useStores();

  const { css } = useClasses({ isDrawerOpen: homeStore.isDrawerOpen });

  const [isLoading, setIsLoading] = useState(true);

  useSockets({ view: "home" });

  useEffect(() => {
    document.title = "Media Viewer // Home";

    const loadDatabase = async () => {
      try {
        let perfStart = performance.now();

        await Promise.all([
          fileCollectionStore.loadCollections(),
          importStore.loadImportBatches(),
          importStore.loadRegExMaps(),
          tagStore.loadTags(),
        ]);

        console.debug(`Data loaded into MobX in ${performance.now() - perfStart}ms.`);
        setIsLoading(false);
      } catch (err) {
        console.error(err);
      }
    };

    loadDatabase();
  }, []);

  return (
    <Views.ImportDnD>
      <View column className={css.root}>
        <Views.Search {...{ isLoading }} hasImports />

        <Views.CollectionModals />

        <Views.FileModals />

        <Views.ImportModals />

        <Views.TagModals view="home" />
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
