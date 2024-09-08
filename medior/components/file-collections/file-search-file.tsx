import { CSSProperties } from "react";
import { FileSchema } from "medior/database";
import { File, observer, useStores } from "medior/store";
import { Button, FileBase } from "medior/components";
import { colors, dayjs } from "medior/utils";

export interface FileSearchFileProps {
  disabled?: boolean;
  file?: FileSchema;
  height?: CSSProperties["height"];
}

export const FileSearchFile = observer(
  ({ disabled, file, height = "14rem" }: FileSearchFileProps) => {
    const stores = useStores();

    const handleAdd = () => stores.collection.editor.addFilesToCollection([new File(file)]);

    return (
      <FileBase.Container {...{ disabled, height }} flex="none">
        <FileBase.Image
          {...{ disabled, height }}
          thumbPaths={file.thumbPaths}
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
            <FileBase.Chip
              position="bottom-right"
              label={dayjs.duration(file.duration, "s").format("HH:mm:ss")}
            />
          )}
        </FileBase.Image>

        <FileBase.Footer>
          <FileBase.Tags tagIds={file.tagIds} />

          <FileBase.Tooltip {...{ disabled, file }} />
        </FileBase.Footer>
      </FileBase.Container>
    );
  }
);
