import { MouseEvent } from "react";
import type { FileSchema, TagSchema } from "medior/_generated/server";
import type { JpegCompression } from "medior/server/duplicate-quality";
import { Comp, FileBase, Text, View } from "medior/components";
import { colors, CssColor, openCarouselWindow } from "medior/utils/client";
import { dayjs, Fmt } from "medior/utils/common";

export interface GroupFileProps {
  /** The files the carousel opens with, so it can step through the whole group. */
  carouselFileIds: string[];
  chip?: { bgColor?: CssColor; label: string };
  /** How the file compared with its group's kept file, such as how much of it differs. */
  comparison?: string;
  file: FileSchema & { tags: TagSchema[] };
  isSelected?: boolean;
  /** The JPEG compression the file's quality was judged by. */
  jpeg?: JpegCompression;
  onClick?: (event: MouseEvent) => void;
  showDateCreated?: boolean;
}

export const GroupFile = Comp(
  ({
    carouselFileIds,
    chip,
    comparison,
    file,
    isSelected,
    jpeg,
    onClick,
    showDateCreated,
  }: GroupFileProps) => {
    const handleDoubleClick = () => openCarouselWindow({ file, selectedFileIds: carouselFileIds });

    const hasTags = file.tags.length > 0;

    return (
      <View column flex="none" width="15rem" spacing="0.3rem" padding={{ all: "0.3rem" }}>
        <FileBase.Container
          height="13rem"
          selected={isSelected}
          selectedColor={colors.custom.red}
          onClick={onClick}
          onDoubleClick={handleDoubleClick}
        >
          <FileBase.Image
            thumb={file.thumb}
            fileId={file.id}
            title={file.originalName}
            fit="contain"
            height="13rem"
          >
            {chip && (
              <FileBase.Chip
                position="top-left"
                label={chip.label}
                bgColor={chip.bgColor}
                color={colors.custom.white}
                opacity={1}
              />
            )}

            <FileBase.Chip position="top-right" label={file.ext} />

            {!!file.duration && (
              <FileBase.Chip
                position="bottom-right"
                label={Fmt.duration(file.duration)}
                hasFooter={hasTags}
              />
            )}
          </FileBase.Image>

          {hasTags && (
            <FileBase.Footer>
              <FileBase.Tags tags={file.tags} />
            </FileBase.Footer>
          )}
        </FileBase.Container>

        <Text fontSize="0.85em">{`${file.width} × ${file.height} · ${Fmt.bytes(file.size)}`}</Text>

        {!!file.duration && (
          <Text fontSize="0.85em">
            {[file.videoCodec, !!file.bitrate && `${Fmt.bytes(file.bitrate)}/s`]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        )}

        {jpeg && (
          <Text fontSize="0.85em">
            {`JPEG quality ${jpeg.quality}${jpeg.isSubsampled ? " · subsampled colour" : ""}`}
          </Text>
        )}

        {!!comparison && (
          <Text color={colors.custom.lightGrey} fontSize="0.8em">
            {comparison}
          </Text>
        )}

        {showDateCreated && (
          <Text color={colors.custom.lightGrey} fontSize="0.8em">
            {dayjs(file.dateCreated).format("YYYY-MM-DD HH:mm:ss")}
          </Text>
        )}

        <Text color={colors.custom.lightGrey} fontSize="0.8em" tooltip={file.originalName}>
          {file.originalName}
        </Text>
      </View>
    );
  },
);
