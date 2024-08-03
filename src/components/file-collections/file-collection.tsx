import { observer, useStores } from "src/store";
import { FileBase, Text } from "src/components";
import { CollectionTooltip } from ".";
import { colors, CSS, makeClasses, round } from "src/utils";

export interface FileCollectionProps {
  height?: CSS["height"];
  id: string;
  width?: CSS["width"];
}

export const FileCollection = observer(({ height, id, width }: FileCollectionProps) => {
  const { css } = useClasses(null);

  const stores = useStores();

  const collection = stores.collection.getById(id);
  const hasSelectedFiles = stores.collection.managerFileIds.length > 0;

  const handleSelect = () => stores.collection.setSelectedCollectionId(id);

  const handleTagPress = (tagId: string) => {
    stores.tag.setActiveTagId(tagId);
    stores.tag.setIsTagEditorOpen(true);
  };

  const openCollection = () => {
    stores.collection.setEditorFiles([]);
    stores.collection.setEditorId(id);
    stores.collection.setIsEditorOpen(true);
  };

  return (
    <FileBase.Container
      {...{ height, width }}
      onClick={hasSelectedFiles ? handleSelect : null}
      onDoubleClick={openCollection}
      selected={hasSelectedFiles && id === stores.collection.selectedCollectionId}
    >
      <FileBase.Image
        thumbPaths={collection.thumbPaths}
        title={collection.title}
        height={height}
        fit={stores.collection.collectionFitMode}
      >
        <FileBase.Chip
          position="top-left"
          icon="Star"
          iconColor={colors.amber["600"]}
          label={round(collection.rating, 1)}
        />

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
