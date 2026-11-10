import { Icon, TooltipWrapper } from "medior/components";
import { colors } from "medior/utils/client";

export interface InfoTooltipProps {
  text: string;
}

/** An info icon whose tooltip holds a setting's details, keeping them off the settings rows. */
export const InfoTooltip = ({ text }: InfoTooltipProps) => (
  <TooltipWrapper tooltip={text}>
    <Icon name="InfoOutline" size="1em" color={colors.custom.lightGrey} />
  </TooltipWrapper>
);
