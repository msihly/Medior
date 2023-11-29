import { ConditionalWrap, Tooltip, TooltipProps } from "components";

export interface TooltipWrapperProps {
  children: JSX.Element | JSX.Element[];
  tooltip?: TooltipProps["title"];
  tooltipProps?: Partial<TooltipProps>;
}

export const TooltipWrapper = ({ children, tooltip, tooltipProps = {} }: TooltipWrapperProps) => {
  return (
    <ConditionalWrap
      condition={tooltip !== undefined && !(typeof tooltip === "string" && !tooltip?.length)}
      wrap={(c) => (
        <Tooltip title={tooltip} {...tooltipProps}>
          {c}
        </Tooltip>
      )}
    >
      {children}
    </ConditionalWrap>
  );
};
