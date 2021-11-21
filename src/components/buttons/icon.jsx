import React, { createElement } from "react";
import { IconButton as MuiIconButton } from "@mui/material";
import * as Icons from "@mui/icons-material";

const IconButton = ({ children, name, onClick, size = "small", ...props }) => {
  return (
    <MuiIconButton {...props} {...{ onClick, size }}>
      {name && createElement(Icons[name])}
      {children}
    </MuiIconButton>
  );
};

export default IconButton;
