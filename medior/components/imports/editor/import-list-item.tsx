import { useState } from "react";
import { TagSchema } from "medior/_generated/server";
import { ModelCreationData } from "mobx-keystone";
import type { ImportStatus } from "medior/server/database";
import {
  Button,
  Chip,
  Comp,
  Detail,
  DiffusionDetails,
  Icon,
  IMPORT_STATUSES,
  TagRow,
  Text,
  Tooltip,
  TooltipWrapper,
  View,
} from "medior/components";
import { FileImport } from "medior/store";
import { colors, CssColor, makeClasses, openCarouselWindow, toast } from "medior/utils/client";
import { CONSTANTS, Fmt, hasComfyMetadata } from "medior/utils/common";
import { rpc } from "medior/utils/server";
import { IMPORT_CHIP_STYLE, TooltipChip } from "./tooltip-chip";

export const IMPORT_LIST_ITEM_HEIGHT = 30;

export interface ImportListItemProps {
  batchImports: ModelCreationData<FileImport>[];
  bgColor?: CssColor;
  fileImport: ModelCreationData<FileImport>;
  noStatus?: boolean;
  style?: React.CSSProperties;
}

export const ImportListItem = Comp(
  ({ batchImports, bgColor, fileImport, noStatus = false, style = {} }: ImportListItemProps) => {
    const { css } = useClasses(null);

    const [isOpening, setIsOpening] = useState(false);
    const [tags, setTags] = useState<TagSchema[]>([]);

    const statusMeta = IMPORT_STATUSES[fileImport.status as ImportStatus];
    const music = fileImport.musicPreview?.music;
    // The import names the file as its sidecar does, when it has one.
    const originalName = fileImport.sidecar?.originalName ?? fileImport.name;

    const handleOpen = async () => {
      try {
        const res = await rpc.listTag({ filter: { id: fileImport.tagIds } });
        if (!res.success) throw new Error(res.error);

        setTags(res.data);
      } catch (err) {
        console.error(err);
        toast.error("Error loading tags");
      }
    };

    const openFile = async () => {
      setIsOpening(true);

      try {
        const res = await rpc.listFile({ args: { filter: { id: fileImport.fileId } } });
        if (!res.success) throw new Error(res.error);

        if (!res.data.items.length) return toast.warn("File no longer exists in the library");

        openCarouselWindow({
          file: res.data.items[0],
          selectedFileIds: Array.from(
            new Set(
              batchImports
                .filter((item) => item.fileId && ["COMPLETE", "DUPLICATE"].includes(item.status))
                .map((item) => item.fileId),
            ),
          ),
        });
      } catch (error) {
        console.error(error);
        toast.error("Failed to open file");
      } finally {
        setIsOpening(false);
      }
    };

    return (
      <View
        row
        align="center"
        justify="space-between"
        padding={{ all: "0 0.5rem" }}
        bgColor={bgColor}
        spacing="0.5rem"
        style={style}
      >
        {!noStatus && statusMeta ? (
          <Tooltip
            borderColor={statusMeta.color}
            title={
              <View column spacing="0.5rem">
                <Text color={statusMeta.color} fontWeight={500}>
                  {statusMeta.label}
                </Text>

                {fileImport.errorMsg && (
                  <Text whiteSpace="normal" overflowWrap="anywhere">
                    {fileImport.errorMsg}
                  </Text>
                )}

                {fileImport.fileId && ["COMPLETE", "DUPLICATE"].includes(fileImport.status) && (
                  <Button text="Open File" onClick={openFile} loading={isOpening} />
                )}
              </View>
            }
          >
            <Icon name={statusMeta.icon} color={statusMeta.color} />
          </Tooltip>
        ) : null}

        <Text
          tooltip={fileImport.path}
          tooltipProps={{
            enterDelay: CONSTANTS.TOOLTIP.ENTER_DELAY,
            enterNextDelay: CONSTANTS.TOOLTIP.ENTER_NEXT_DELAY,
            flexShrink: "inherit",
            viewProps: { width: "100%" },
          }}
        >
          {fileImport.name}
        </Text>

        <View row spacing="0.5rem">
          {(fileImport.tagIds?.length > 0 || fileImport.tagsToUpsert?.length > 0) && (
            <TooltipChip
              icon="Label"
              label="Tags"
              onOpen={handleOpen}
              enterDelay={CONSTANTS.TOOLTIP.ENTER_DELAY}
              enterNextDelay={CONSTANTS.TOOLTIP.ENTER_NEXT_DELAY}
            >
              <TagRow tags={[...tags, ...fileImport.tagsToUpsert]} padding={{ all: "0.5rem" }} />
            </TooltipChip>
          )}

          {hasComfyMetadata(fileImport) && (
            <TooltipChip icon="Notes" label="ComfyUI">
              <DiffusionDetails comfyPrompt={fileImport.comfyPrompt} />
            </TooltipChip>
          )}

          {music ? (
            <TooltipChip
              icon="MusicNote"
              label={music.artists.map((artist) => artist.name).join(", ")}
            >
              <Detail label="Credit" value={music.artist ?? music.albumArtist} />

              <Detail label="Title" value={music.title ?? originalName} />

              <Detail label="Album" value={music.album} />

              <Detail
                label="Source"
                value={fileImport.musicPreview.isFromName ? "File Name" : "Tags"}
              />
            </TooltipChip>
          ) : fileImport.musicPreview?.error ? (
            <TooltipWrapper tooltip={fileImport.musicPreview.error}>
              <Chip
                icon="MusicOff"
                label="Unreadable"
                bgColor={colors.custom.red}
                className={css.chip}
              />
            </TooltipWrapper>
          ) : fileImport.musicPreview ? (
            <Chip
              icon="MusicOff"
              label="No Artist"
              bgColor={colors.custom.orange}
              className={css.chip}
            />
          ) : null}

          <Chip label={Fmt.bytes(fileImport.size)} className={css.chip} />

          <Chip label={fileImport.extension} className={css.chip} />
        </View>
      </View>
    );
  },
);

const useClasses = makeClasses({
  chip: IMPORT_CHIP_STYLE,
});
