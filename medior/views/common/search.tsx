import {
  Comp,
  Drawer,
  FileContainer,
  HomeMultiActionBar,
  SearchLoadingOverlay,
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
    <View column className={css.root}>
      <HomeMultiActionBar isHome={isHome} />

      <View row flex={1} overflow="hidden">
        <Drawer hasImports={isHome} hasSettings={isHome} />

        <View column className={css.main}>
          <FileContainer view={isHome ? "home" : "search"} />
        </View>
      </View>

      <SearchLoadingOverlay store={stores.file.search} />
    </View>
  );
});

const useClasses = makeClasses({
  main: {
    display: "flex",
    flexFlow: "column",
    marginLeft: CONSTANTS.HOME.DRAWER.WIDTH,
    width: `calc(100% - ${CONSTANTS.HOME.DRAWER.WIDTH}px)`,
    height: "100%",
    overflow: "auto",
    transition: "all 225ms ease-in-out",
  },
  root: {
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
  },
});
