import { getCurrentWebContents } from "@electron/remote";
import { File, observer, useStores } from "medior/store";
import { Icon, Text, View } from "medior/components";
import { FileBase } from ".";
import { colors, CSS, duration, openCarouselWindow, trpc } from "medior/utils";
import { toast } from "react-toastify";

interface FileCardProps {
  disabled?: boolean;
  file?: File;
  height?: CSS["height"];
  id?: string;
  width?: CSS["width"];
}

export const FileCard = observer(({ disabled, file, height, id, width }: FileCardProps) => {
  const stores = useStores();

  if (!file) file = stores.file.getById(id);
  // const collections = stores.collection.listByFileId(id);

  const handleClick = async (event: React.MouseEvent) => {
    if (disabled) return;
    const res = await stores.file.search.handleSelect({
      hasCtrl: event.ctrlKey,
      hasShift: event.shiftKey,
      id: file.id,
    });
    if (!res?.success) toast.error(res.error);
  };

  const handleDoubleClick = async () => {
    if (!disabled) {
      const res = await stores.file.search.listIdsForCarousel();
      if (!res?.success) console.error(res.error);
      else openCarouselWindow({ file, selectedFileIds: res.data });
    }
  };

  const handleDragEnd = () => stores.home.setIsDraggingOut(false);

  const handleDragStart = async (event: React.DragEvent) => {
    event.preventDefault();
    stores.home.setIsDraggingOut(true);

    const hasSelected = stores.file.search.selectedIds.includes(file.id);
    const files = hasSelected ? await loadSelectedFiles() : null;
    const filePaths = hasSelected ? files.map((file) => file.path) : [file.path];
    const icon = hasSelected ? files[0].thumb.path : file.thumb.path;

    try {
      getCurrentWebContents().startDrag({ file: file.path, files: filePaths, icon });
    } catch (error) {
      console.error(error);
    }
  };

  const loadSelectedFiles = async () => {
    const res = await trpc.listFiles.mutate({
      args: { filter: { id: stores.file.search.selectedIds } },
    });
    if (!res?.success) throw new Error(res.error);
    return res.data.items;
  };

  return (
    <FileBase.ContextMenu key="context-menu" {...{ disabled, file }}>
      <FileBase.Tooltip {...{ file }}>
        <FileBase.Container
          {...{ disabled, height, width }}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          selected={stores.file.search.getIsSelected(file.id)}
        >
          <FileBase.Image
            animated={file.isAnimated}
            thumb={file.thumb}
            title={file.originalName}
            height={height}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            fit={stores.home.fileCardFit}
            disabled={disabled}
            rounded="all"
            draggable
          >
            <FileBase.RatingChip position="top-left" rating={file.rating} />

            <FileBase.Chip
              position="top-right"
              label={
                <View row>
                  {!file.isAnimated && (
                    <Icon
                      name="Face"
                      size="1.2em"
                      color={file.hasFaceModels ? colors.custom.blue : colors.custom.grey}
                      margins={{ right: "0.3em" }}
                    />
                  )}

                  {file.diffusionParams?.length > 0 && (
                    <Icon name="Notes" size="1em" color={colors.custom.blue} />
                  )}

                  <Text>{file.ext}</Text>
                </View>
              }
            />

            {/* {collections.length > 0 && (
              <FileBase.Chip position="bottom-left" icon="Collections" label={collections.length} />
            )} */}

            {file.duration && (
              <FileBase.Chip label={duration(file.duration)} position="bottom-right" hasFooter />
            )}
          </FileBase.Image>

          <FileBase.Footer>
            {file.tagIds?.length > 0 ? (
              <FileBase.Tags {...{ disabled }} tagIds={file.tagIds} />
            ) : (
              <View />
            )}
          </FileBase.Footer>
        </FileBase.Container>
      </FileBase.Tooltip>
    </FileBase.ContextMenu>
  );
});
