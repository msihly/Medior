import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { View } from "components";
import { Views, useSockets } from "./common";
import { makeClasses, makePerfLog } from "utils";

export const SearchWindow = observer(() => {
  const { homeStore, tagStore } = useStores();

  const { css } = useClasses({ isDrawerOpen: homeStore.isDrawerOpen });

  const [isLoading, setIsLoading] = useState(true);

  useSockets({ view: "search" });

  useEffect(() => {
    document.title = "Medior // Search";

    const loadDatabase = async () => {
      try {
        const { perfLog, perfLogTotal } = makePerfLog("[Home]");

        await homeStore.loadFilteredFiles({ page: 1 });
        perfLog("Filtered files loaded");
        setIsLoading(false);

        await tagStore.loadTags();
        perfLog("Tags loaded");

        perfLogTotal("Data loaded into MobX");
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
