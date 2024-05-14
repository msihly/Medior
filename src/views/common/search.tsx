import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { Drawer, FileContainer, HomeMultiActionBar, LoadingOverlay, View } from "components";
import { CONSTANTS, makeClasses } from "utils";

interface SearchProps {
  hasImports?: boolean;
  hasSettings?: boolean;
  isLoading: boolean;
}

export const Search = observer(
  ({ hasImports = false, hasSettings = false, isLoading }: SearchProps) => {
    const stores = useStores();

    const { css } = useClasses({ isDrawerOpen: stores.home.isDrawerOpen });

    return (
      <>
        <HomeMultiActionBar />

        <View row>
          <Drawer {...{ hasImports, hasSettings }} />

          <View column className={css.main}>
            {isLoading ? null : <FileContainer />}
          </View>
        </View>

        <LoadingOverlay isLoading={stores.home.isLoading} />
      </>
    );
  }
);

interface ClassesProps {
  isDrawerOpen: boolean;
}

const useClasses = makeClasses((_, { isDrawerOpen }: ClassesProps) => ({
  main: {
    display: "flex",
    flexFlow: "column",
    marginLeft: isDrawerOpen ? CONSTANTS.DRAWER_WIDTH : 0,
    width: isDrawerOpen ? `calc(100% - ${CONSTANTS.DRAWER_WIDTH}px)` : "inherit",
    height: `calc(100vh - ${CONSTANTS.TOP_BAR_HEIGHT})`,
    overflow: "auto",
    transition: "all 225ms ease-in-out",
  },
}));
