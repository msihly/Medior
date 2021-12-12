import { Button as MuiButton, ButtonProps as MuiButtonProps } from "@mui/material";

export const Button = ({
  children,
  color = "primary",
  size = "small",
  variant = "contained",
  ...props
}: MuiButtonProps) => {
  return (
    <MuiButton {...{ color, size, variant }} {...props}>
      {children}
    </MuiButton>
  );
};
