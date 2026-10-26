import { Comp, Icon, LoadingOverlay, Text, View } from "medior/components";
import {
  makeTileClickHandler,
  openSearchCarousel,
  useFileDrag,
} from "medior/components/files/hooks";
import { File, FileSearch, FileTransformSearch, useStores } from "medior/store";
import { colors, CSS, makeClasses, openCarouselWindow } from "medior/utils/client";
import { Fmt, round } from "medior/utils/common";
import { FileBase } from ".";

interface FileCardProps {
  carouselFileIds?: string[];
  /** Seconds each carousel video starts playing at, by file ID. */
  carouselStartTimes?: Record<string, number>;
  disabled?: boolean;
  file?: File;
  height?: CSS["height"];
  similarity?: {
    rank: number;
    score: number;
    start?: number;
  };
  store: FileSearch | FileTransformSearch;
  width?: CSS["width"];
}

export const FileCard = Comp(
  ({
    carouselFileIds,
    carouselStartTimes,
    disabled,
    file,
    height,
    similarity,
    store,
    width,
  }: FileCardProps) => {
    const stores = useStores();

    const { css } = useClasses(null);

    const fileDragProps = useFileDrag(file, store.selectedIds);

    const hasTags = file?.tags?.length > 0;
    const showFileName = stores.home.showFileName && !!file?.originalName;
    const hasFooter = hasTags || showFileName;
    const footerOffset = showFileName ? (hasTags ? "3.5rem" : "1.5rem") : undefined;

    const handleClick = makeTileClickHandler({
      disabled,
      id: file?.id,
      select: "handleFileSelect" in store ? store.handleFileSelect : store.handleSelect,
    });

    const handleDoubleClick = async () => {
      if (!disabled) {
        if (carouselFileIds?.length)
          openCarouselWindow({
            file,
            selectedFileIds: carouselFileIds,
            startTimes: carouselStartTimes,
          });
        else await openSearchCarousel(file, store);
      }
    };

    if (!file)
      return (
        <FileBase.Container {...{ disabled, height, width }} flex="none">
          <LoadingOverlay isLoading />
        </FileBase.Container>
      );

    return (
      <FileBase.ContextMenu {...{ carouselFileIds, disabled, file }} store={store}>
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
                  bgColor={
                    similarity.score >= 0.9
                      ? colors.custom.green
                      : similarity.score >= 0.7
                        ? colors.custom.orange
                        : colors.custom.red
                  }
                  color={colors.custom.white}
                  opacity={1}
                  avatar={<Text className={css.similarityRank}>{`#${similarity.rank}`}</Text>}
                  label={`${round(similarity.score * 100, 1)}%${
                    similarity.start === undefined ? "" : ` @ ${Fmt.duration(similarity.start)}`
                  }`}
                />
              ) : (
                <FileBase.RatingChip position="top-left" rating={file.rating} />
              )}

              <FileBase.ExtAndIcons position="top-right" file={file} />

              {file.collectionIds?.length > 0 && (
                <FileBase.Chip
                  position="bottom-left"
                  hasFooter={hasFooter}
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
                hasFooter={hasFooter}
                footerOffset={footerOffset}
              />
            </FileBase.Image>

            {hasFooter && (
              <FileBase.Footer height={showFileName ? (hasTags ? "4rem" : "1.8rem") : undefined}>
                <View column width="100%" overflow="hidden">
                  {showFileName && <FileBase.FooterText text={file.originalName} />}

                  {hasTags && <FileBase.Tags compact={showFileName} tags={file.tags} />}
                </View>
              </FileBase.Footer>
            )}
          </FileBase.Container>
        </FileBase.Tooltip>
      </FileBase.ContextMenu>
    );
  },
);

const useClasses = makeClasses({
  similarityRank: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgb(0 0 0 / 0.3)",
    borderRadius: "50%",
  },
});
