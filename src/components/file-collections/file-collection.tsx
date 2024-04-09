import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { FileBase, Text } from "components";
import { CollectionTooltip } from ".";
import { colors, makeClasses, round } from "utils";
import { CSSObject } from "tss-react";

export interface FileCollectionProps {
  height?: CSSObject["height"];
  id: string;
  width?: CSSObject["width"];
}

export const FileCollection = observer(({ height, id, width }: FileCollectionProps) => {
  const { fileCollectionStore, tagStore } = useStores();
  const collection = fileCollectionStore.getById(id);

  const { css } = useClasses(null);

  const handleTagPress = (tagId: string) => {
    tagStore.setActiveTagId(tagId);
    tagStore.setIsTagEditorOpen(true);
  };

  const openCollection = () => {
    fileCollectionStore.setActiveFiles([]);
    fileCollectionStore.setActiveCollectionId(id);
    fileCollectionStore.setIsEditorOpen(true);
  };

  return (
    <FileBase.Container {...{ height, width }} onDoubleClick={openCollection}>
      <FileBase.Image
        thumbPaths={collection.thumbPaths}
        title={collection.title}
        height={height}
        fit={fileCollectionStore.collectionFitMode}
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
