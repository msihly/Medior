import { ipcRenderer } from "electron";
import { useEffect, useState } from "react";
import { observer, useStores } from "src/store";
import { View } from "src/components";
import { Views, useSockets } from "./common";
import { makeClasses, makePerfLog } from "src/utils";

export const SearchWindow = observer(() => {
  const stores = useStores();

  const { css } = useClasses({ isDrawerOpen: stores.home.isDrawerOpen });

  const [isLoading, setIsLoading] = useState(true);

  useSockets({ view: "search" });

  useEffect(() => {
    document.title = "Medior // Search";

    ipcRenderer.on("init", async (_, { tagIds }: { tagIds: string[] }) => {
      try {
        const { perfLog, perfLogTotal } = makePerfLog("[Home]");

        await stores.tag.loadTags();
        perfLog("Tags loaded");

        stores.home.setSearchValue(
          tagIds.map((id) => stores.tag.tagOptions.find((tag) => tag.id === id))
        );

        await stores.home.loadFilteredFiles({ page: 1 });
        perfLog("Filtered files loaded");
        setIsLoading(false);

        perfLogTotal("Data loaded into MobX");
      } catch (err) {
        console.error(err);
      }
    });
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
