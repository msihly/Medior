import { IconButton, IconButtonProps } from "components";

export interface MultiActionButtonProps extends IconButtonProps {}

export const MultiActionButton = ({ tooltipProps = {}, ...props }: MultiActionButtonProps) => {
  return (
    <IconButton {...props} size="medium" tooltipProps={{ placement: "bottom", ...tooltipProps }} />
  );
};
