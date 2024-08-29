import { observer, useStores } from "medior/store";
import { ContextMenu, FileBase, Text } from "medior/components";
import { CollectionTooltip } from ".";
import { CSS, makeClasses, round } from "medior/utils";

export interface FileCollectionProps {
  height?: CSS["height"];
  id: string;
  width?: CSS["width"];
}

export const FileCollection = observer(({ height, id, width }: FileCollectionProps) => {
  const { css } = useClasses(null);

  const stores = useStores();

  const collection = stores.collection.manager.getById(id);
  if (!collection) return null;

  const hasSelectedFiles = stores.collection.manager.selectedFileIds.length > 0;

  const handleDelete = async () => {
    await stores.collection.editor.loadCollection({ id });
    stores.collection.setIsConfirmDeleteOpen(true);
  };

  const handleRefreshMeta = () => stores.collection.regenCollMeta([id]);

  const handleSelect = () => stores.collection.manager.setSelectedCollectionId(id);

  const handleTagPress = (tagId: string) => {
    stores.tag.setActiveTagId(tagId);
    stores.tag.setIsTagEditorOpen(true);
  };

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
      <FileBase.Container
        {...{ height, width }}
        onClick={hasSelectedFiles ? handleSelect : null}
        onDoubleClick={openCollection}
        selected={hasSelectedFiles && id === stores.collection.manager.selectedCollectionId}
      >
        <FileBase.Image
          thumbPaths={collection.thumbPaths}
          title={collection.title}
          height={height}
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
          {collection.title.length > 0 && (
            <Text tooltip={collection.title} tooltipProps={{ flexShrink: 1 }} className={css.title}>
              {collection.title}
            </Text>
          )}

          <CollectionTooltip {...{ collection }} onTagPress={handleTagPress} />
        </FileBase.Footer>
      </FileBase.Container>
    </ContextMenu>
  );
});

const useClasses = makeClasses({
  title: {
    width: "100%",
    fontSize: "0.9em",
    textAlign: "center",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});
