import {
  Card,
  Comp,
  DateDetail,
  Detail,
  Icon,
  TagRow,
  Text,
  Tooltip as TooltipBase,
  UniformList,
  View,
} from "medior/components";
import { File } from "medior/store";
import { colors } from "medior/utils/client";
import { Fmt } from "medior/utils/common";

interface TooltipProps {
  children: JSX.Element;
  disabled?: boolean;
  file: File;
}

export const Tooltip = Comp(({ children, disabled, file }: TooltipProps) => {
  return (
    <TooltipBase
      enterDelay={700}
      enterNextDelay={300}
      minWidth="15rem"
      title={
        <View column padding={{ all: "0.3rem" }} spacing="0.5rem">
          {file.isCorrupted && (
            <View row justify="center" spacing="0.5rem">
              <Icon name="WarningRounded" color={colors.custom.orange} />

              <Text preset="title" color={colors.custom.orange}>
                {"Corrupted"}
              </Text>
            </View>
          )}

          <UniformList row spacing="1rem">
            <UniformList column>
              <Detail label="Size" value={Fmt.bytes(file.size)} />
              <Detail label="Dimensions" value={`${file.width} x ${file.height}`} />
            </UniformList>

            <UniformList column>
              <DateDetail label="Date Created" value={file.dateCreated} />
              <DateDetail label="Date Modified" value={file.dateModified} />
            </UniformList>
          </UniformList>

          <Text preset="detail-label">{"Tags"}</Text>
          <TagRow tags={file.tags} disabled={disabled} />

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
