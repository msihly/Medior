import { Comp, Icon, LoadingOverlay, Text, View } from "medior/components";
import { useFileDrag } from "medior/components/files/hooks";
import { File, FileSearch, FileTransformSearch, useStores } from "medior/store";
import { CSS, openCarouselWindow, toast } from "medior/utils/client";
import { round } from "medior/utils/common";
import { FileBase } from ".";

interface FileCardProps {
  carouselFileIds?: string[];
  disabled?: boolean;
  file?: File;
  height?: CSS["height"];
  similarity?: {
    rank: number;
    score: number;
  };
  store: FileSearch | FileTransformSearch;
  width?: CSS["width"];
}

export const FileCard = Comp(
  ({ carouselFileIds, disabled, file, height, similarity, store, width }: FileCardProps) => {
    const stores = useStores();
    const footerOffset = stores.home.showFileName ? "3.5rem" : undefined;

    const fileDragProps = useFileDrag(file, store.selectedIds);

    const handleClick = async (event: React.MouseEvent) => {
      if (disabled) return;
      const res = await ("handleFileSelect" in store
        ? store.handleFileSelect({
            hasCtrl: event.ctrlKey,
            hasShift: event.shiftKey,
            id: file.id,
          })
        : store.handleSelect({
            hasCtrl: event.ctrlKey,
            hasShift: event.shiftKey,
            id: file.id,
          }));
      if (!res?.success) toast.error(res.error);
    };

    const handleDoubleClick = async () => {
      if (!disabled) {
        if (carouselFileIds?.length) openCarouselWindow({ file, selectedFileIds: carouselFileIds });
        else {
          const res = await store.listIdsForCarousel();
          if (!res?.success) console.error(res.error);
          else openCarouselWindow({ file, selectedFileIds: res.data });
        }
      }
    };

    if (!file)
      return (
        <FileBase.Container {...{ disabled, height, width }} flex="none">
          <LoadingOverlay isLoading />
        </FileBase.Container>
      );

    return (
      <FileBase.ContextMenu
        key="context-menu"
        {...{ carouselFileIds, disabled, file }}
        store={store}
      >
        <FileBase.Tooltip {...{ file }}>
          <FileBase.Container
            {...{ disabled, height, width }}
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
            selected={
              "getIsFileSelected" in store
                ? store.getIsFileSelected(file.id)
                : store.getIsSelected(file.id)
            }
          >
            <FileBase.Image
              {...fileDragProps}
              thumb={file.thumb}
              fileId={file.id}
              isCorrupted={file.isCorrupted}
              title={file.originalName}
              fit={stores.home.fileCardFit}
              height={height}
              draggable
            >
              {similarity ? (
                <FileBase.Chip
                  position="top-left"
                  avatar={
                    <Text
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                      bgcolor="rgb(0 0 0 / 0.3)"
                      borderRadius="50%"
                    >
                      {`#${similarity.rank}`}
                    </Text>
                  }
                  label={`${round(similarity.score * 100, 1)}%`}
                />
              ) : (
                <FileBase.RatingChip position="top-left" rating={file.rating} />
              )}

              <FileBase.ExtAndIcons position="top-right" file={file} />

              {file.collectionIds?.length > 0 && (
                <FileBase.Chip
                  position="bottom-left"
                  hasFooter
                  footerOffset={footerOffset}
                  label={
                    <View row spacing="0.3em">
                      <Icon name="Collections" size="1em" />

                      <Text>{file.collectionIds.length}</Text>
                    </View>
                  }
                />
              )}

              <FileBase.Duration
                position="bottom-right"
                file={file}
                hasFooter
                footerOffset={footerOffset}
              />
            </FileBase.Image>

            <FileBase.Footer height={stores.home.showFileName ? "4rem" : undefined}>
              <View column width="100%" overflow="hidden">
                {stores.home.showFileName && <FileBase.FooterText text={file.originalName} />}

                <FileBase.Tags compact={stores.home.showFileName} tags={file.tags} />
              </View>
            </FileBase.Footer>
          </FileBase.Container>
        </FileBase.Tooltip>
      </FileBase.ContextMenu>
    );
  },
);
