import { MouseEvent, useEffect, useRef, useState } from "react";
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
  const anchorRef = useRef<HTMLElement>(null);

  const handleClose = () => setOpen(false);

  const handleMouseEnter = (event: MouseEvent<HTMLElement>) => {
    anchorRef.current = event.currentTarget;
  };

  const handleOpen = () => {
    if (!disabled && anchorRef.current && !anchorRef.current.closest('[aria-hidden="true"]'))
      setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    if (disabled) return setOpen(false);
    const observer = new MutationObserver(() => {
      if (anchorRef.current?.closest('[aria-hidden="true"]')) setOpen(false);
    });
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["aria-hidden"],
      subtree: true,
    });
    window.addEventListener("scroll", handleClose, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", handleClose, true);
    };
  }, [disabled, open]);

  return (
    <TooltipBase
      open={open && !disabled}
      onOpen={handleOpen}
      onClose={handleClose}
      onMouseEnter={handleMouseEnter}
      enterDelay={CONSTANTS.TOOLTIP.ENTER_DELAY}
      enterNextDelay={CONSTANTS.TOOLTIP.ENTER_NEXT_DELAY}
      minWidth="15rem"
      viewProps={{ column: true, width: "100%" }}
      title={
        <View column padding={{ all: "0.3rem" }} spacing="0.5rem">
          {file.isCorrupted && (
            <View row align="center" justify="center" spacing="0.5rem">
              <Icon name="Warning" color={colors.custom.orange} />

              <Text preset="title" color={colors.custom.orange}>
                {"Corrupted"}
              </Text>
            </View>
          )}

          <Detail label="Original Name" value={file.originalName} />

          <UniformList row spacing="1rem">
            <UniformList column spacing="0.5rem">
              <Detail label="Size" value={Fmt.bytes(file.size)} />

              <Detail label="Dimensions" value={`${file.width} x ${file.height}`} />

              <Detail
                label="Bitrate"
                value={file.bitrate ? `${Fmt.bytes(file.bitrate)}/s` : "--"}
              />
            </UniformList>

            <UniformList column spacing="0.5rem">
              <DateDetail label="Date Created" value={file.dateCreated} />

              <DateDetail label="Date Modified" value={file.dateModified} />

              <DateDetail label="Date Imported" value={file.dateImported} />
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
