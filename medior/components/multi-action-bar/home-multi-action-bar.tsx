import { useState } from "react";
import { SortValue } from "medior/store/_generated";
import {
  Chip,
  Comp,
  DeselectAllButton,
  FileActionButtons,
  FileFilter,
  MultiActionButton,
  SelectAllButton,
  SelectAllInQueryButton,
  View,
} from "medior/components";
import { FileSearch, useStores } from "medior/store";
import { colors, makeClasses, toast } from "medior/utils/client";
import { CONSTANTS } from "medior/utils/common";
import { SelectedFilesTooltip, SelectFilesModal } from ".";

interface HomeMultiActionBarProps {
  isHome?: boolean;
  store?: FileSearch;
}

export const HomeMultiActionBar = Comp(
  ({ isHome = false, store: suppliedStore }: HomeMultiActionBarProps) => {
    const stores = useStores();
    const store = suppliedStore ?? stores.file.search;

    const { css } = useClasses(null);

    const [isSelectModalOpen, setIsSelectModalOpen] = useState(false);

    const sourceSortValue = suppliedStore
      ? undefined
      : ((store.cachedFilterProps as { sortValue?: SortValue })?.sortValue ?? store.sortValue);

    return (
      <>
        <View component="header" position="static" width="100%" className={css.appBar}>
          <View className={css.container}>
            <View row align="center" spacing="0.5rem">
              {!suppliedStore && <FileFilter.Menu store={store} />}

              {store.isArchiveOpen && <Chip label="Archived" bgColor={colors.custom.red} />}

              {store.selectedIds.length > 0 && <SelectedFilesTooltip store={store} />}
            </View>

            <View row align="center" spacing="0.5rem">
              <FileActionButtons isHome={isHome} sourceSortValue={sourceSortValue} store={store} />

              <DeselectAllButton itemLabel="files" store={store} toast={toast} />

              <SelectAllButton itemLabel="files" store={store} toast={toast} />

              <MultiActionButton
                name="Checklist"
                tooltip="Select First Files in Query"
                disabled={!!suppliedStore && !store.results.length}
                onClick={() => setIsSelectModalOpen(true)}
              />

              <SelectAllInQueryButton
                itemLabel="files"
                store={store}
                toast={toast}
                disabled={!!suppliedStore && !store.results.length}
              />
            </View>
          </View>
        </View>

        {isSelectModalOpen && (
          <SelectFilesModal store={store} onClose={() => setIsSelectModalOpen(false)} />
        )}
      </>
    );
  },
);

const useClasses = makeClasses({
  appBar: {
    borderBottom: `1px solid ${colors.border}`,
    display: "flex",
    flexFlow: "row nowrap",
    flexGrow: 0,
    flexShrink: 0,
    zIndex: 5,
  },
  container: {
    background: colors.background,
    display: "flex",
    flexGrow: 1,
    flexShrink: 0,
    height: CONSTANTS.HOME.TOP_BAR.HEIGHT,
    justifyContent: "space-between",
    padding: "0.3rem 0.5rem",
  },
});
