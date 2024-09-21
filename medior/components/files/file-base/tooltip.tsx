import { FileSchema } from "medior/database";
import { observer } from "medior/store";
import {
  Card,
  DateDetail,
  Detail,
  TagRow,
  Text,
  Tooltip as TooltipBase,
  UniformList,
  View,
} from "medior/components";
import { formatBytes } from "medior/utils";

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
          <UniformList row spacing="1rem">
            <UniformList column>
              <Detail label="Size" value={formatBytes(file.size)} />
              <Detail label="Dimensions" value={`${file.width} x ${file.height}`} />
            </UniformList>

            <UniformList column>
              <DateDetail label="Date Created" value={file.dateCreated} />
              <DateDetail label="Date Modified" value={file.dateModified} />
            </UniformList>
          </UniformList>

          <Text preset="detail-label">{"Tags"}</Text>
          <TagRow tagIds={file.tagIds} disabled={disabled} />

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
