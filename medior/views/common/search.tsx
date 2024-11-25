import { observer, useStores } from "medior/store";
import { Drawer, FileContainer, HomeMultiActionBar, LoadingOverlay, View } from "medior/components";
import { CONSTANTS, makeClasses } from "medior/utils";

interface SearchProps {
  hasImports?: boolean;
  hasSettings?: boolean;
}

export const Search = observer(({ hasImports = false, hasSettings = false }: SearchProps) => {
  const { css } = useClasses(null);

  const stores = useStores();

  return (
    <>
      <HomeMultiActionBar />

      <View row height="inherit" overflow="inherit">
        <Drawer {...{ hasImports, hasSettings }} />

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
