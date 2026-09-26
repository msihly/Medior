import { SORT_OPTIONS } from "medior/store/_generated";
import { Card, Comp, FilterMenu, Input } from "medior/components";
import { SavedImportConfigSearch } from "medior/store";
import { colors } from "medior/utils/client";

export const SavedImportConfigsFilterMenu = Comp(
  ({ store }: { store: SavedImportConfigSearch }) => (
    <FilterMenu
      store={store}
      color={colors.foreground}
      sortOptions={SORT_OPTIONS.SavedImportConfig}
    >
      <Card column spacing="0.5rem" width="30rem">
        <Input header="Label" value={store.label} setValue={store.setLabel} />

        <Input header="Folder Path" value={store.folderPath} setValue={store.setFolderPath} />
      </Card>
    </FilterMenu>
  ),
);
