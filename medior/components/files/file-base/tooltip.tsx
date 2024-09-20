import { FileSchema } from "medior/database";
import { observer } from "medior/store";
import {
  Card,
  Detail,
  TagRow,
  Text,
  Tooltip as TooltipBase,
  UniformList,
  View,
} from "medior/components";
import { dayjs, formatBytes } from "medior/utils";

interface TooltipProps {
  children: JSX.Element;
  disabled?: boolean;
  file: FileSchema;
}

export const Tooltip = observer(({ children, disabled, file }: TooltipProps) => {
  return (
    <TooltipBase
      enterDelay={700}
      enterNextDelay={300}
      minWidth="15rem"
      title={
        <View column padding={{ all: "0.3rem" }} spacing="0.5rem">
          <TagRow tagIds={file.tagIds} disabled={disabled} />

          <UniformList>
            <Detail label="Size" value={formatBytes(file.size)} />

            <Detail label="Dimensions" value={`${file.width} x ${file.height}`} />
          </UniformList>

          <UniformList>
            <Detail
              label="Date Created"
              value={dayjs(file.dateCreated).format("YYYY-MM-DD HH:mm A")}
            />

            <Detail
              label="Date Modified"
              value={dayjs(file.dateModified).format("YYYY-MM-DD HH:mm A")}
            />
          </UniformList>

          {file.diffusionParams?.length > 0 && (
            <Detail
              label="Diffusion Params"
              value={
                <Card height="10rem" overflow="hidden auto">
                  <Text>{file.diffusionParams}</Text>
                </Card>
              }
            />
          )}
        </View>
      }
    >
      <View column width="100%">
        {children}
      </View>
    </TooltipBase>
  );
});
