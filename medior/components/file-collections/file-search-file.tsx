import { CSSProperties } from "react";
import { FileSchema } from "medior/_generated";
import { Button, Comp, FileBase } from "medior/components";
import { useStores } from "medior/store";
import { colors, getIsAnimated } from "medior/utils/client";
import { duration } from "medior/utils/common";

export interface FileSearchFileProps {
  disabled?: boolean;
  file?: FileSchema;
  height?: CSSProperties["height"];
}

export const FileSearchFile = Comp(({ disabled, file, height = "14rem" }: FileSearchFileProps) => {
  const stores = useStores();

  const animated = getIsAnimated(file.ext);

  const handleAdd = () =>
    stores.collection.editor.addFilesToCollection({
      collId: stores.collection.editor.collection.id,
      fileIds: [file.id],
    });

  return (
    <FileBase.Tooltip {...{ disabled, file }}>
      <FileBase.Container {...{ disabled, height }} flex="none">
        <FileBase.Image
          {...{ animated, disabled, height }}
          thumb={file.thumb}
          title={file.originalName}
          fit="contain"
        >
          <FileBase.Chip
            position="top-left"
            label={<Button icon="Add" onClick={handleAdd} color={colors.custom.green} circle />}
            padding={{ all: "0 1px" }}
          />

          <FileBase.Chip
            position="top-right"
            icon="Star"
            iconColor={colors.custom.orange}
            label={file.rating}
          />

          {file.duration && (
            <FileBase.Chip label={duration(file.duration)} position="bottom-right" />
          )}
        </FileBase.Image>

        <FileBase.Footer>
          <FileBase.Tags tagIds={file.tagIds} />
        </FileBase.Footer>
      </FileBase.Container>
    </FileBase.Tooltip>
  );
});
