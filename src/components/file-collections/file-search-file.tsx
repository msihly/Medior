import { CSSProperties } from "react";
import { observer } from "mobx-react-lite";
import { File, useStores } from "store";
import { Button, FileBase } from "components";
import { colors, dayjs } from "utils";

export interface FileSearchFileProps {
  disabled?: boolean;
  file?: File;
  height?: CSSProperties["height"];
}

export const FileSearchFile = observer(
  ({ disabled, file, height = "14rem" }: FileSearchFileProps) => {
    const { fileCollectionStore } = useStores();

    const handleAdd = () => fileCollectionStore.addFileToActiveCollection(file);

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
            label={<Button icon="Add" onClick={handleAdd} color={colors.green["800"]} circle />}
            padding={{ all: "0 1px" }}
          />

          <FileBase.Chip
            position="top-right"
            icon="Star"
            iconColor={colors.amber["600"]}
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
          <FileBase.Tags {...{ disabled }} tags={file.tags} />

          <FileBase.Tooltip {...{ disabled, file }} />
        </FileBase.Footer>
      </FileBase.Container>
    );
  }
);
