import {
  Comp,
  Drawer,
  FileContainer,
  HomeMultiActionBar,
  LoadingOverlay,
  View,
} from "medior/components";
import { useStores } from "medior/store";
import { makeClasses } from "medior/utils/client";
import { CONSTANTS } from "medior/utils/common";

interface SearchProps {
  isHome?: boolean;
}

export const Search = Comp(({ isHome = false }: SearchProps) => {
  const { css } = useClasses(null);

  const stores = useStores();

  return (
    <>
      <HomeMultiActionBar isHome={isHome} />

      <View row height="inherit" overflow="inherit">
        <Drawer hasImports={isHome} hasSettings={isHome} />

        <View column className={css.main}>
          <FileContainer />
        </View>
      </View>

      <LoadingOverlay isLoading={stores.file.search.isLoading} />
    </>
  );
});

const useClasses = makeClasses({
  main: {
    display: "flex",
    flexFlow: "column",
    marginLeft: CONSTANTS.HOME.DRAWER.WIDTH,
    width: `calc(100% - ${CONSTANTS.HOME.DRAWER.WIDTH}px)`,
    height: `calc(100vh - ${CONSTANTS.HOME.TOP_BAR.HEIGHT})`,
    overflow: "auto",
    transition: "all 225ms ease-in-out",
  },
});
