import { observer, useStores } from "medior/store";
import { CollectionTooltip, ContextMenu, FileBase } from "medior/components";
import { colors, CSS, round } from "medior/utils";
import { toast } from "react-toastify";

export interface FileCollectionProps {
  height?: CSS["height"];
  id: string;
  width?: CSS["width"];
}

export const FileCollection = observer(({ height, id, width }: FileCollectionProps) => {
  const stores = useStores();

  const collection = stores.collection.manager.search.getResult(id);
  if (!collection) return null;

  const handleClick = async (event: React.MouseEvent) => {
    const res = await stores.collection.manager.search.handleSelect({
      hasCtrl: event.ctrlKey,
      hasShift: event.shiftKey,
      id,
    });
    if (!res?.success) toast.error(res.error);
  };

  const handleDelete = async () => {
    await stores.collection.editor.loadCollection(id);
    stores.collection.setIsConfirmDeleteOpen(true);
  };

  const handleRefreshMeta = () => stores.collection.regenCollMeta([id]);

  const openCollection = async () => {
    stores.collection.editor.setIsOpen(true);
    await stores.collection.editor.loadCollection(id);
  };

  return (
    <ContextMenu
      id={id}
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
          selected={stores.collection.manager.search.getIsSelected(id)}
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
