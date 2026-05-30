import { useEffect, useState } from "react";
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
import { CONSTANTS, Fmt } from "medior/utils/common";

interface TooltipProps {
  children: JSX.Element;
  disabled?: boolean;
  file: File;
}

export const Tooltip = Comp(({ children, disabled, file }: TooltipProps) => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handleScroll = () => setOpen(false);
    window.addEventListener("scroll", handleScroll, true);
    return () => window.removeEventListener("scroll", handleScroll, true);
  }, [open]);

  return (
    <TooltipBase
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      enterDelay={CONSTANTS.TOOLTIP.ENTER_DELAY}
      enterNextDelay={CONSTANTS.TOOLTIP.ENTER_NEXT_DELAY}
      minWidth="15rem"
      viewProps={{ column: true, width: "100%" }}
      title={
        <View column padding={{ all: "0.3rem" }} spacing="0.5rem">
          {file.isCorrupted && (
            <View row justify="center" spacing="0.5rem">
              <Icon name="Warning" color={colors.custom.orange} />

              <Text preset="title" color={colors.custom.orange}>
                {"Corrupted"}
              </Text>
            </View>
          )}

          <UniformList row spacing="1rem">
            <UniformList column spacing="0.5rem">
              <Detail label="Size" value={Fmt.bytes(file.size)} />
              <Detail label="Dimensions" value={`${file.width} x ${file.height}`} />
            </UniformList>

            <UniformList column spacing="0.5rem">
              <DateDetail label="Date Created" value={file.dateCreated} />
              <DateDetail label="Date Modified" value={file.dateModified} />
            </UniformList>
          </UniformList>

          {file.tags?.length > 0 && (
            <Detail
              label="Tags"
              value={<TagRow tags={file.tags} disabled={disabled} padding={{ top: "0.3rem" }} />}
            />
          )}

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
      {children}
    </TooltipBase>
  );
});
