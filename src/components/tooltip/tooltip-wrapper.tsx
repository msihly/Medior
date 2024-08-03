import { ConditionalWrap, Tooltip, TooltipProps } from "src/components";

export interface TooltipWrapperProps {
  children: JSX.Element | JSX.Element[];
  tooltip?: TooltipProps["title"];
  tooltipProps?: Partial<TooltipProps>;
}

export const TooltipWrapper = ({ children, tooltip, tooltipProps = {} }: TooltipWrapperProps) => {
  const wrap = (c: JSX.Element) => (
    <Tooltip title={tooltip} {...tooltipProps}>
      {c}
    </Tooltip>
  );

  return (
    <ConditionalWrap
      wrap={wrap}
      condition={tooltip !== undefined && !(typeof tooltip === "string" && !tooltip?.length)}
    >
      {children}
    </ConditionalWrap>
  );
};
