import { ReactNode } from "react";
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { IconButton as MuiIconButton, IconButtonProps as MuiIconButtonProps } from "@mui/material";
import { Icon, IconName, IconProps, TooltipWrapper, TooltipWrapperProps } from "components";
import { makeClasses, Margins } from "utils";

export interface IconButtonProps extends Omit<MuiIconButtonProps, "color"> {
  children?: ReactNode | ReactNode[];
  iconProps?: Partial<IconProps>;
  margins?: Margins;
  name?: IconName;
  tooltip?: TooltipWrapperProps["tooltip"];
  tooltipProps?: TooltipWrapperProps["tooltipProps"];
}

export const IconButton = ({
  children,
  className,
  disabled,
  iconProps = {},
  margins,
  name,
  onClick,
  size,
  tooltip,
  tooltipProps,
  ...props
}: IconButtonProps) => {
  const { css, cx } = useClasses({ disabled, margins });

  return (
    <TooltipWrapper {...{ tooltip, tooltipProps }}>
      <MuiIconButton
        {...props}
        {...{ disabled, onClick, size }}
        className={cx(css.root, className)}
      >
        {name && <Icon {...iconProps} name={name} />}
        {children}
      </MuiIconButton>
    </TooltipWrapper>
  );
};

const useClasses = makeClasses((_, { disabled, margins }) => ({
  root: {
    margin: margins?.all,
    marginTop: margins?.top,
    marginBottom: margins?.bottom,
    marginRight: margins?.right,
    marginLeft: margins?.left,
    opacity: disabled ? 0.5 : 1,
    transition: "all 100ms ease-in-out",
  },
}));
