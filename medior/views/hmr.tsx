import { useEffect, useState } from "react";
import { Card, Comp, View } from "medior/components";
import { useStores } from "medior/store";
import { makeClasses } from "medior/utils/client";
import { useSockets, Views } from "./common";

export const HMR = Comp(() => {
  const stores = useStores();

  const { css } = useClasses(null);

  const [isLoading, setIsLoading] = useState(true);

  useSockets({ view: "home" });

  useEffect(() => {
    (async () => {
      setIsLoading(false);
      stores.file.videoTransformer.setIsOpen(true);
    })();
  }, []);

  return isLoading ? null : (
    <Views.ImportDnD>
      <View column className={css.root}>
        <Card height="100%" width="100%"></Card>

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
    padding: "0.5rem",
    height: "100vh",
    width: "100vw",
    overflow: "hidden",
  },
});
