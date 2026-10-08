import { useEffect, useState } from "react";
import { Card, Comp, RepairModal, View } from "medior/components";
import { useStores } from "medior/store";
import { makeClasses } from "medior/utils/client";
import { useSockets, Views } from "./common";

export const HMR = Comp(() => {
  const stores = useStores();

  const { css } = useClasses(null);

  const [isLoading, setIsLoading] = useState(true);

  useSockets({ view: "home" });

  useEffect(() => {
    setIsLoading(false);
    stores.file.videoTransformer.setIsOpen(true);
  }, []);

  return isLoading ? null : (
    <Views.ImportDnD>
      <View column className={css.root}>
        <Card height="100%" width="100%" />

        <Views.CollectionModals />

        <Views.FileModals />

        <Views.ImportModals />

        <Views.TagModals view="home" />

        <RepairModal />
      </View>
    </Views.ImportDnD>
  );
});

const useClasses = makeClasses({
  root: {
    height: "100vh",
    overflow: "hidden",
    padding: "0.5rem",
    width: "100vw",
  },
});
