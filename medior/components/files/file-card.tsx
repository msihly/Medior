import { Comp, Icon, Text, View } from "medior/components";
import { File, useStores } from "medior/store";
import { colors, CSS, openCarouselWindow, toast, useFileDrag } from "medior/utils/client";
import { duration } from "medior/utils/common";
import { FileBase } from ".";

interface FileCardProps {
  disabled?: boolean;
  file?: File;
  height?: CSS["height"];
  id?: string;
  width?: CSS["width"];
}

export const FileCard = Comp(({ disabled, file, height, id, width }: FileCardProps) => {
  const stores = useStores();

  if (!file) file = stores.file.getById(id);
  const fileDragProps = useFileDrag(file, stores.file.search.selectedIds);

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
            {...fileDragProps}
            thumb={file.thumb}
            title={file.originalName}
            fit={stores.home.fileCardFit}
            height={height}
            draggable
          >
            <FileBase.RatingChip position="top-left" rating={file.rating} />

            <FileBase.Chip
              position="top-right"
              label={
                <View row spacing="0.3em">
                  {!file.isAnimated && (
                    <Icon
                      name="Face"
                      size="1.2em"
                      color={file.hasFaceModels ? colors.custom.blue : colors.custom.grey}
                    />
                  )}

                  {file.isCorrupted && (
                    <Icon name="WarningRounded" size="1em" color={colors.custom.orange} />
                  )}

                  {file.diffusionParams?.length > 0 && (
                    <Icon name="Notes" size="1em" color={colors.custom.blue} />
                  )}

                  <Text>{file.ext}</Text>
                </View>
              }
            />

            {file.duration && (
              <FileBase.Chip label={duration(file.duration)} position="bottom-right" hasFooter />
            )}
          </FileBase.Image>

          <FileBase.Footer>
            {file.tags?.length > 0 ? (
              <FileBase.Tags {...{ disabled }} tags={file.tags} />
            ) : (
              <View />
            )}
          </FileBase.Footer>
        </FileBase.Container>
      </FileBase.Tooltip>
    </FileBase.ContextMenu>
  );
});
