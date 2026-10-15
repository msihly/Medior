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

interface SearchProps {
  isHome?: boolean;
}

export const Search = Comp(({ isHome = false }: SearchProps) => {
  const stores = useStores();

  const { css } = useClasses(null);

  return (
    <View row className={css.root}>
      <Drawer hasDuplicates={isHome} hasImports={isHome} hasSettings={isHome} />

      <View column flex={1} position="relative" overflow="hidden">
        <HomeMultiActionBar isHome={isHome} />

        <View column className={css.main}>
          <FileContainer view={isHome ? "home" : "search"} />
        </View>

        <SearchLoadingOverlay store={stores.file.search} />
      </View>
    </View>
  );
});

const useClasses = makeClasses({
  main: {
    display: "flex",
    flexFlow: "column",
    flex: 1,
    minHeight: 0,
    overflow: "auto",
  },
  root: {
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
  },
});
