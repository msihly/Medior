import { Card, CardBase, Comp, FileBase, Text, View } from "medior/components";
import { makeTileClickHandler, openSearchCarousel } from "medior/components/files/hooks";
import { FileTransform, useStores } from "medior/store";
import { colors } from "medior/utils/client";
import { TransformDetails } from "./transform-details";

export interface FileDetailsProps {
  /** The transform's index in the current page of results. */
  index: number;
  transform: FileTransform;
}

export const FileDetails = Comp(({ index, transform }: FileDetailsProps) => {
  const stores = useStores();
  const store = stores.file.videoTransformer;

  const file = store.search.files.get(transform.fileId);
  const hasTags = file?.tags?.length > 0;
  const queueIndex = (store.search.page - 1) * store.search.pageSize + index + 1;
  const status = getTransformStatusDisplay(transform);

  const handleClick = makeTileClickHandler({
    id: transform.id,
    select: store.search.handleSelect,
  });

  const handleDoubleClick = () => openSearchCarousel(file, store.search);

  return !file ? null : (
    <FileBase.ContextMenu file={file} store={store.search} disabled>
      <FileBase.Tooltip file={file}>
        <FileBase.Container
          height="13.5rem"
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          selected={store.search.getIsSelected(transform.id)}
        >
          <Card row height="100%" width="100%" bgColor={colors.background} padding={{ all: 0 }}>
            <FileBase.Container disabled height="13rem" width="13rem">
              <FileBase.Image
                thumb={file.thumb}
                fileId={file.id}
                isCorrupted={file.isCorrupted}
                title={file.originalName}
                fit="contain"
                height="13rem"
              >
                <CardBase.Chip
                  position="top-left"
                  label={
                    status ? (
                      <Text fontSize="inherit" tooltip={transform.errorMsg}>
                        {`${queueIndex} - ${status.label}`}
                      </Text>
                    ) : (
                      queueIndex
                    )
                  }
                  bgColor={status?.color ?? colors.custom.black}
                  opacity={1}
                  radiuses={{ bottomRight: "inherit", left: 0, top: 0 }}
                  flush
                />

                <FileBase.RatingChip position="bottom-left" rating={file.rating} />

                <FileBase.ExtAndIcons position="top-right" file={file} />

                <FileBase.Duration position="bottom-right" file={file} hasFooter={hasTags} />
              </FileBase.Image>

              {hasTags && (
                <FileBase.Footer>
                  <FileBase.Tags tags={file.tags} />
                </FileBase.Footer>
              )}
            </FileBase.Container>

            <View column justify="center" padding={{ all: 4 }}>
              <TransformDetails transform={transform} compact />
            </View>
          </Card>
        </FileBase.Container>
      </FileBase.Tooltip>
    </FileBase.ContextMenu>
  );
});

export const getTransformStatusDisplay = (transform: FileTransform) => {
  if (transform.status === "MERGED") return { color: colors.custom.green, label: "Merged" };
  else if (transform.status === "DUPLICATE")
    return { color: colors.custom.orange, label: "Duplicate" };
  else if (transform.status === "COMPRESSED")
    return { color: colors.custom.green, label: "Compressed" };
  else if (transform.status === "SKIPPED") return { color: colors.custom.orange, label: "Skipped" };
  else if (transform.status === "ERROR") return { color: colors.custom.red, label: "Error" };
  else return null;
};
