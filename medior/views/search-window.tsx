import { ipcRenderer } from "electron";
import { useEffect } from "react";
import { Comp, MinimizedJobs, View, WindowTitleBar } from "medior/components";
import { tagToOption, useStores } from "medior/store";
import { makeClasses } from "medior/utils/client";
import { rpc } from "medior/utils/server";
import { useSockets, Views } from "./common";

export const SearchWindow = Comp(() => {
  const stores = useStores();

  const { css } = useClasses(null);

  useSockets({ view: "search" });

  useEffect(() => {
    const initialize = async (_, { tagIds }: { tagIds: string[] }) => {
      try {
        const res = await rpc.listTag({ filter: { id: tagIds } });
        if (!res.success) throw new Error(res.error);

        stores.file.search.setTags(res.data.map(tagToOption));

        await stores.file.search.loadFiltered({ noCache: true, page: 1 });
      } catch (err) {
        console.error(err);
      }
    };

    ipcRenderer.on("init", initialize);

    return () => {
      ipcRenderer.removeListener("init", initialize);
    };
  }, []);

  return (
    <View column className={css.root}>
      <WindowTitleBar title="Medior" />

      <View column flex={1} overflow="hidden" position="relative">
        <Views.Search />

        <Views.CollectionModals />

        <Views.FileModals />

        <Views.MediaProgramModals />

        <Views.TagModals view="search" />

        <MinimizedJobs />
      </View>
    </View>
  );
});

const useClasses = makeClasses({
  root: {
    height: "100vh",
    overflow: "hidden",
  },
});
