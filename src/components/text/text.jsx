import React from "react";
import { Typography } from "@mui/material";

const Text = ({ children, component = "span", ...props }) => {
  return (
    <Typography {...{ component }} {...props}>
      {children}
    </Typography>
  );
};

export default Text;
