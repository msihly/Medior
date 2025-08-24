import { CollectionTooltip, Comp, ContextMenu, FileBase } from "medior/components";
import { FileCollection as FileCollType, useStores } from "medior/store";
import { colors, CSS, toast } from "medior/utils/client";
import { round } from "medior/utils/common";

export interface FileCollectionProps {
  collection: FileCollType;
  height?: CSS["height"];
  width?: CSS["width"];
}

export const FileCollection = Comp(({ collection, height, width }: FileCollectionProps) => {
  const stores = useStores();

  const handleClick = async (event: React.MouseEvent) => {
    const res = await stores.collection.manager.search.handleSelect({
      hasCtrl: event.ctrlKey,
      hasShift: event.shiftKey,
      id: collection.id,
    });
    if (!res?.success) toast.error(res.error);
  };

  const handleDelete = async () => {
    await stores.collection.editor.loadCollection(collection.id);
    stores.collection.setIsConfirmDeleteOpen(true);
  };

  const handleRefreshMeta = () => stores.collection.regenCollMeta([collection.id]);

  const openCollection = async () => {
    stores.collection.editor.setIsOpen(true);
    await stores.collection.editor.loadCollection(collection.id);
  };

  return (
    <ContextMenu
      id={collection.id}
      menuItems={[
        { label: "Refresh Metadata", icon: "Refresh", onClick: handleRefreshMeta },
        { label: "Delete", icon: "Delete", color: colors.custom.red, onClick: handleDelete },
      ]}
    >
      <CollectionTooltip {...{ collection }}>
        <FileBase.Container
          {...{ height, width }}
          onClick={handleClick}
          onDoubleClick={openCollection}
          selected={stores.collection.manager.search.getIsSelected(collection.id)}
        >
          <FileBase.Image
            thumbs={collection.thumbs}
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
            <FileBase.FooterText text={collection.title} noTooltip />
          </FileBase.Footer>
        </FileBase.Container>
      </CollectionTooltip>
    </ContextMenu>
  );
});
