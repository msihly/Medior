import { useState } from "react";
import {
  Card,
  CardGrid,
  Chip,
  Comp,
  ConfirmModal,
  IconButton,
  Pagination,
  SearchLoadingOverlay,
  View,
} from "medior/components";
import { useStores } from "medior/store";
import { colors, toast } from "medior/utils/client";
import { DuplicateBatch } from "./duplicate-batch";
import { FileDetails } from "./file-details";
import { TransformFilterMenu } from "./transform-filter-menu";

export const TransformSearch = Comp(() => {
  const stores = useStores();
  const store = stores.file.videoTransformer;

  const [idsForDelete, setIdsForDelete] = useState<string[]>([]);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const openDeleteConfirmation = () => {
    setIdsForDelete([...store.search.selectedIds]);
    setIsConfirmDeleteOpen(true);
  };

  const setDeleteConfirmationVisible = (visible: boolean) => {
    if (!isDeleting) setIsConfirmDeleteOpen(visible);
  };

  const confirmDelete = async () => {
    setIsDeleting(true);
    try {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      const res = await store.deleteTransforms(idsForDelete);
      if (!res.success) {
        toast.error(res.error);
        return false;
      }
      toast.success(`Deleted ${res.data.toLocaleString()} transform records`);
      setIdsForDelete([]);
      return true;
    } finally {
      setIsDeleting(false);
    }
  };

  const hasSelected = store.search.selectedIds.length > 0;

  return (
    <>
      <Card
        height="100%"
        overflow="hidden"
        header={
          <View row align="center" justify="space-between" width="100%">
            <View row align="center" spacing="0.5rem">
              <TransformFilterMenu />

              <DuplicateBatch />

              {hasSelected && <Chip label={`${store.search.selectedIds.length} Selected`} />}
            </View>

            <IconButton
              name="Delete"
              onClick={openDeleteConfirmation}
              disabled={!hasSelected || isDeleting}
              iconProps={{ color: hasSelected ? colors.custom.red : colors.custom.grey }}
              tooltip="Delete selected"
            />
          </View>
        }
        headerProps={{ justify: "flex-start", padding: { all: "0.3rem" } }}
        padding={{ all: "0" }}
      >
        <SearchLoadingOverlay store={store.search} />

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
          isLoading={store.search.isPageCountLoading && !store.search.isLoading}
          onChange={(page) => store.loadQueue({ page })}
          onFullLoad={() => store.loadQueue({ withFullCount: true })}
          siblingCount={2}
        />
      </Card>

      {isConfirmDeleteOpen && (
        <ConfirmModal
          headerText="Delete Transform Records"
          onConfirm={confirmDelete}
          setVisible={setDeleteConfirmationVisible}
          subText={
            isDeleting
              ? `Deleting ${idsForDelete.length.toLocaleString()} selected transform records...`
              : `Delete ${idsForDelete.length.toLocaleString()} selected transform records? Original and output files will not be deleted.`
          }
        />
      )}
    </>
  );
});
