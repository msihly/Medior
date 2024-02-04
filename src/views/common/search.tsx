import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { Drawer, FileContainer, TopBar, View } from "components";
import { CONSTANTS, makeClasses } from "utils";

interface SearchProps {
  hasImports?: boolean;
  isLoading: boolean;
}

export const Search = observer(({ hasImports = false, isLoading }: SearchProps) => {
  const { homeStore } = useStores();

  const { css } = useClasses({ isDrawerOpen: homeStore.isDrawerOpen });

  return (
    <>
      <TopBar />

      <View row>
        <Drawer {...{ hasImports }} />

        <View column className={css.main}>
          {isLoading ? null : <FileContainer />}
        </View>
      </View>
    </>
  );
});

const useClasses = makeClasses((_, { isDrawerOpen }) => ({
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
