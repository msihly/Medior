import { colors } from "trabecula/utils/client";
import { Card, CardBase, Comp, FileBase, View } from "medior/components";
import { FileTransform, useStores } from "medior/store";
import { openCarouselWindow, toast } from "medior/utils/client";
import { TransformDetails } from "./transform-details";

export interface FileDetailsProps {
  transform: FileTransform;
}

export const FileDetails = Comp(({ transform }: FileDetailsProps) => {
  const stores = useStores();
  const store = stores.file.videoTransformer;
  const file = store.search.files.get(transform.fileId);
  const fileIndex = store.search.results.findIndex((t) => t.id === transform.id);
  const queueIndex = (store.search.page - 1) * store.search.pageSize + fileIndex + 1;
  const status = getTransformStatusDisplay(transform);

  const handleClick = async (event: React.MouseEvent) => {
    const res = await store.search.handleSelect({
      hasCtrl: event.ctrlKey,
      hasShift: event.shiftKey,
      id: transform.id,
    });
    if (!res?.success) toast.error(res.error);
  };

  const handleDoubleClick = async () => {
    if (!file) return;
    const res = await store.search.listIdsForCarousel();
    if (!res?.success) console.error(res.error);
    else openCarouselWindow({ file, selectedFileIds: res.data });
  };

  return !file ? null : (
    <FileBase.ContextMenu key="context-menu" file={file} store={store.search} disabled>
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
                title={file.originalName}
                fit="contain"
                height="13rem"
              >
                <CardBase.Chip
                  position="top-left"
                  label={status ? `${queueIndex} - ${status.label}` : queueIndex}
                  bgColor={status?.color ?? colors.custom.black}
                  opacity={1}
                  radiuses={{ left: 0, top: 0, bottomRight: "inherit" }}
                  flush
                />

                <FileBase.RatingChip position="bottom-left" rating={file.rating} />

                <FileBase.ExtAndIcons position="top-right" file={file} />

                <FileBase.Duration position="bottom-right" file={file} hasFooter />
              </FileBase.Image>

              <FileBase.Footer>
                <FileBase.Tags tags={file.tags} />
              </FileBase.Footer>
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

const getTransformStatusDisplay = (transform: FileTransform) => {
  if (transform.status === "COMPRESSED") return { color: colors.custom.green, label: "Compressed" };
  if (transform.status === "SKIPPED") return { color: colors.custom.orange, label: "Skipped" };
  if (transform.status === "ERROR") return { color: colors.custom.red, label: "Error" };
  return null;
};
