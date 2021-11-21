import React from "react";
import { Button as MuiButton } from "@mui/material";

const Button = ({
  children,
  color = "primary",
  size = "small",
  variant = "contained",
  ...props
}) => {
  return (
    <MuiButton {...{ color, size, variant }} {...props}>
      {children}
    </MuiButton>
  );
};

export default Button;
