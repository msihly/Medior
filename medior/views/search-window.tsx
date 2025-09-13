import { ipcRenderer } from "electron";
import { useEffect } from "react";
import { Comp, View } from "medior/components";
import { tagToOption, useStores } from "medior/store";
import { makeClasses } from "medior/utils/client";
import { trpc } from "medior/utils/server";
import { useSockets, Views } from "./common";

export const SearchWindow = Comp(() => {
  const stores = useStores();

  const { css } = useClasses({ isDrawerOpen: stores.home.isDrawerOpen });

  useSockets({ view: "search" });

  useEffect(() => {
    document.title = "Medior —— Search";

    ipcRenderer.on("init", async (_, { tagIds }: { tagIds: string[] }) => {
      try {
        const tags = (await trpc.listTag.mutate({ args: { filter: { id: tagIds } } })).data.items;
        stores.file.search.setTags(tags.map(tagToOption));

        await stores.file.search.loadFiltered({ page: 1 });
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
