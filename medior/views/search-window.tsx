import { ipcRenderer } from "electron";
import { useEffect } from "react";
import { Comp, View } from "medior/components";
import { useStores } from "medior/store";
import { makeClasses } from "medior/utils/client";
import { useSockets, Views } from "./common";

export const SearchWindow = Comp(() => {
  const stores = useStores();

  const { css } = useClasses({ isDrawerOpen: stores.home.isDrawerOpen });

  useSockets({ view: "search" });

  useEffect(() => {
    document.title = "Medior —— Search";

    ipcRenderer.on("init", async (_, { tagIds }: { tagIds: string[] }) => {
      try {
        await stores.file.search.loadFiltered({ page: 1 });
        await stores.tag.loadTags();
        stores.file.search.setTags(
          tagIds.map((id) => stores.tag.tagOptions.find((tag) => tag.id === id)),
        );
      } catch (err) {
        console.error(err);
      }
    });
  }, []);

  return (
    <View column className={css.root}>
      <Views.Search />

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
