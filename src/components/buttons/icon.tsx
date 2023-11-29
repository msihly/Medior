// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { IconButton as MuiIconButton, IconButtonProps as MuiIconButtonProps } from "@mui/material";
import { Icon, IconName, IconProps } from "components";
import { ReactNode } from "react";
import { makeClasses, Margins } from "utils";

export interface IconButtonProps extends MuiIconButtonProps {
  children?: ReactNode | ReactNode[];
  iconProps?: Partial<IconProps>;
  margins?: Margins;
  name?: IconName;
}

export const IconButton = ({
  children,
  className,
  iconProps = {},
  margins = {},
  name,
  onClick,
  size,
  ...props
}: IconButtonProps) => {
  const { css, cx } = useClasses({
    margin: margins.all,
    marginTop: margins.top,
    marginBottom: margins.bottom,
    marginRight: margins.right,
    marginLeft: margins.left,
  });

  return (
    <MuiIconButton {...props} {...{ onClick, size }} className={cx(css.root, className)}>
      {name && <Icon {...iconProps} name={name} />}
      {children}
    </MuiIconButton>
  );
};

const useClasses = makeClasses(
  (_, { margin, marginTop, marginBottom, marginRight, marginLeft }) => ({
    root: {
      margin,
      marginTop,
      marginBottom,
      marginRight,
      marginLeft,
    },
  })
);
