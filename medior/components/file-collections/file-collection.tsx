import { observer, useStores } from "medior/store";
import { CollectionTooltip, ContextMenu, FileBase } from "medior/components";
import { CSS, round } from "medior/utils";

export interface FileCollectionProps {
  height?: CSS["height"];
  id: string;
  width?: CSS["width"];
}

export const FileCollection = observer(({ height, id, width }: FileCollectionProps) => {
  const stores = useStores();

  const collection = stores.collection.manager.getById(id);
  if (!collection) return null;

  const handleClick = async (event: React.MouseEvent) => {
    if (event.shiftKey) {
      const res = await stores.collection.manager.search.getShiftSelected({
        id,
        selectedIds: stores.collection.manager.selectedCollectionIds,
      });
      if (!res?.success) throw new Error(res.error);

      stores.collection.manager.toggleSelected([
        ...res.data.idsToDeselect.map((i) => ({ id: i, isSelected: false })),
        ...res.data.idsToSelect.map((i) => ({ id: i, isSelected: true })),
      ]);
    } else if (event.ctrlKey) {
      stores.collection.manager.toggleSelected([
        { id, isSelected: !stores.collection.manager.getIsSelected(id) },
      ]);
    } else {
      stores.collection.manager.toggleSelected([
        ...stores.collection.manager.selectedCollectionIds.map((id) => ({ id, isSelected: false })),
        { id, isSelected: true },
      ]);
    }
  };

  const handleDelete = async () => {
    await stores.collection.editor.loadCollection({ id });
    stores.collection.setIsConfirmDeleteOpen(true);
  };

  const handleRefreshMeta = () => stores.collection.regenCollMeta([id]);

  const openCollection = async () => {
    await stores.collection.editor.loadCollection({ id });
    stores.collection.editor.setIsOpen(true);
  };

  return (
    <ContextMenu
      id={id}
      menuItems={[
        { label: "Refresh Metadata", icon: "Refresh", onClick: handleRefreshMeta },
        { label: "Delete", icon: "Delete", onClick: handleDelete },
      ]}
    >
      <CollectionTooltip {...{ collection }}>
        <FileBase.Container
          {...{ height, width }}
          onClick={handleClick}
          onDoubleClick={openCollection}
          selected={stores.collection.manager.getIsSelected(id)}
        >
          <FileBase.Image
            thumbPaths={collection.thumbPaths}
            title={collection.title}
            fit={stores.collection.collectionFitMode}
          >
            <FileBase.RatingChip position="top-left" rating={round(collection.rating, 1)} />

            <FileBase.Chip
              position="top-right"
              icon="Collections"
              label={collection.fileIdIndexes.length}
            />
          </FileBase.Image>

          <FileBase.Footer>
            <FileBase.FooterText text={collection.title} />
          </FileBase.Footer>
        </FileBase.Container>
      </CollectionTooltip>
    </ContextMenu>
  );
});
