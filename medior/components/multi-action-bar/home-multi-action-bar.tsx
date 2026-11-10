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
import { colors, toast } from "medior/utils/client";
import { SearchTabs, SelectedFilesTooltip, SelectFilesModal } from ".";

interface HomeMultiActionBarProps {
  /** A search other than the Files view's, which shows no filter menu or search tabs. */
  store?: FileSearch;
}

/** A file search's controls, as the header of the card showing its results. */
export const HomeMultiActionBar = Comp(({ store: suppliedStore }: HomeMultiActionBarProps) => {
  const stores = useStores();
  const store = suppliedStore ?? stores.file.shownSearch;

  const [isSelectModalOpen, setIsSelectModalOpen] = useState(false);

  const sourceSortValue = suppliedStore
    ? undefined
    : ((store.cachedFilterProps as { sortValue?: SortValue })?.sortValue ?? store.sortValue);

  return (
    <>
      <View row flex={1} align="center" justify="space-between">
        <View row align="center" spacing="0.5rem">
          {!suppliedStore && <FileFilter.Menu store={store} />}

          {!suppliedStore && <SearchTabs />}

          {store.isArchiveOpen && <Chip label="Archived" bgColor={colors.custom.red} />}

          {store.selectedIds.length > 0 && <SelectedFilesTooltip store={store} />}
        </View>

        <View row align="center" spacing="0.5rem">
          <FileActionButtons sourceSortValue={sourceSortValue} store={store} />

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

      {isSelectModalOpen && (
        <SelectFilesModal store={store} onClose={() => setIsSelectModalOpen(false)} />
      )}
    </>
  );
});
