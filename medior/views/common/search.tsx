import {
  Card,
  Comp,
  FileContainer,
  HomeMultiActionBar,
  SEARCH_HEADER_PROPS,
  SearchLoadingOverlay,
  View,
} from "medior/components";
import { useStores } from "medior/store";
import { colors, makeClasses } from "medior/utils/client";

/** The Files view, showing the search of its shown tab. */
export const Search = Comp(() => {
  const stores = useStores();

  const { css } = useClasses(null);

  return (
    <Card
      flex={1}
      height="100%"
      minHeight={0}
      padding={{ all: 0 }}
      overflow="hidden"
      bgColor={colors.background}
      headerProps={SEARCH_HEADER_PROPS}
      header={<HomeMultiActionBar />}
    >
      <View column className={css.main}>
        <FileContainer />
      </View>

      <SearchLoadingOverlay store={stores.file.shownSearch} />
    </Card>
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
});
