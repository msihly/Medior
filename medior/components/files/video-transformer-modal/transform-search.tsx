import {
  Card,
  CardGrid,
  Chip,
  Comp,
  IconButton,
  LoadingOverlay,
  Pagination,
  View,
} from "medior/components";
import { useStores } from "medior/store";
import { colors } from "medior/utils/client";
import { FileDetails } from "./file-details";
import { TransformFilterMenu } from "./transform-filter-menu";

export const TransformSearch = Comp(() => {
  const stores = useStores();
  const store = stores.file.videoTransformer;

  const hasSelected = store.search.selectedIds.length > 0;

  return (
    <Card
      height="100%"
      overflow="hidden"
      header={
        <View row align="center" justify="space-between" width="100%">
          <View row align="center" spacing="0.5rem">
            <TransformFilterMenu />

            {hasSelected && <Chip label={`${store.search.selectedIds.length} Selected`} />}
          </View>

          <IconButton
            name="Delete"
            onClick={() => store.deleteTransforms(store.search.selectedIds)}
            disabled={!hasSelected}
            iconProps={{ color: hasSelected ? colors.custom.red : colors.custom.grey }}
            tooltip="Delete selected"
          />
        </View>
      }
      headerProps={{ justify: "flex-start", padding: { all: "0.3rem" } }}
      padding={{ all: "0" }}
    >
      <LoadingOverlay isLoading={store.search.isLoading} />

      <CardGrid
        cards={store.search.results.map((transform) => (
          <FileDetails key={transform.id} transform={transform} />
        ))}
        maxCards={3}
        noResultsText="No files found"
        padding={{ all: "0.3rem 0.3rem 3.5rem" }}
      />

      <Pagination
        count={store.search.pageCount}
        page={store.search.page}
        isLoading={store.search.isPageCountLoading}
        onChange={(page) => store.loadQueue({ page })}
        onFullLoad={() => store.loadQueue({ withFullCount: true })}
        siblingCount={2}
      />
    </Card>
  );
});
