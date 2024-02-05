import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { View } from "components";
import { Views, useSockets } from "./common";
import { makeClasses } from "utils";

export const SearchWindow = observer(() => {
  const { fileCollectionStore, homeStore, tagStore } = useStores();

  const { css } = useClasses({ isDrawerOpen: homeStore.isDrawerOpen });

  const [isLoading, setIsLoading] = useState(true);

  useSockets({ view: "search" });

  useEffect(() => {
    document.title = "Media Viewer // Search";

    const loadDatabase = async () => {
      try {
        let perfStart = performance.now();

        await Promise.all([fileCollectionStore.loadCollections(), tagStore.loadTags()]);

        console.debug(`Data loaded into MobX in ${performance.now() - perfStart}ms.`);
        setIsLoading(false);
      } catch (err) {
        console.error(err);
      }
    };

    loadDatabase();
  }, []);

  return (
    <View column className={css.root}>
      <Views.Search {...{ isLoading }} />

      <Views.CollectionModals />

      <Views.FileModals />

      <Views.TagModals view="search" />
    </View>
  );
});

const useClasses = makeClasses({
  root: {
    height: "100vh",
    overflow: "hidden",
  },
});
