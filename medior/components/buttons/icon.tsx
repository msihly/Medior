import { ReactNode } from "react";
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { IconButton as MuiIconButton, IconButtonProps as MuiIconButtonProps } from "@mui/material";
import { Icon, IconName, IconProps, TooltipWrapper, TooltipWrapperProps } from "medior/components";
import { makeClasses, makeMargins, Margins } from "medior/utils/client";

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

interface ClassesProps {
  disabled: boolean;
  margins: Margins;
}

const useClasses = makeClasses((props: ClassesProps) => ({
  root: {
    ...makeMargins(props.margins),
    opacity: props.disabled ? 0.5 : 1,
    transition: "all 100ms ease-in-out",
  },
}));
