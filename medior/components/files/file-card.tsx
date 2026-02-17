import { Comp, Icon, LoadingOverlay, Text, View } from "medior/components";
import { useFileDrag } from "medior/components/files/hooks";
import { File, FileSearch, useStores } from "medior/store";
import { colors, CSS, openCarouselWindow, toast } from "medior/utils/client";
import { CONSTANTS, Fmt, VideoCodec } from "medior/utils/common";
import { FileBase } from ".";

interface FileCardProps {
  disabled?: boolean;
  file?: File;
  height?: CSS["height"];
  id?: string;
  store: FileSearch;
  width?: CSS["width"];
}

export const FileCard = Comp(({ disabled, file, height, id, store, width }: FileCardProps) => {
  const stores = useStores();

  if (!file) file = stores.file.getById(id);
  const fileDragProps = useFileDrag(file, store.selectedIds);

  if (!file)
    return (
      <FileBase.Container {...{ disabled, height, width }}>
        <LoadingOverlay isLoading />
      </FileBase.Container>
    );

  const handleClick = async (event: React.MouseEvent) => {
    if (disabled) return;
    const res = await store.handleSelect({
      hasCtrl: event.ctrlKey,
      hasShift: event.shiftKey,
      id: file.id,
    });
    if (!res?.success) toast.error(res.error);
  };

  const handleDoubleClick = async () => {
    if (!disabled) {
      const res = await store.listIdsForCarousel();
      if (!res?.success) console.error(res.error);
      else openCarouselWindow({ file, selectedFileIds: res.data });
    }
  };

  return (
    <FileBase.ContextMenu key="context-menu" {...{ disabled, file }} store={store}>
      <FileBase.Tooltip {...{ file }}>
        <FileBase.Container
          {...{ disabled, height, width }}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          selected={store.getIsSelected(file.id)}
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
                    <Icon name="Warning" size="1em" color={colors.custom.orange} />
                  )}

                  {file.diffusionParams?.length > 0 && (
                    <Icon name="Notes" size="1em" color={colors.custom.blue} />
                  )}

                  <View row align="center">
                    <Text>{file.ext}</Text>
                    {!CONSTANTS.VIDEO_CODECS.includes(file.videoCodec as VideoCodec) ? null : (
                      <Text color={colors.custom.lightGrey}>{`/${file.videoCodec}`}</Text>
                    )}
                  </View>
                </View>
              }
            />

            {file.duration && (
              <FileBase.Chip
                label={
                  <View row spacing="0.3em">
                    {file.audioCodec === "None" && <Icon name="VolumeOff" size="1em" />}
                    <Text>{Fmt.duration(file.duration)}</Text>
                  </View>
                }
                position="bottom-right"
                hasFooter
              />
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
