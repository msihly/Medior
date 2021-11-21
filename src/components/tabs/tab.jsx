import React from "react";
import { Tab as MuiTab, TabPanel } from "@mui/material";

const Tab = ({ children, label }) => {
  return (
    <MuiTab label={label} value={label}>
      <TabPanel value={label}>{children}</TabPanel>
    </MuiTab>
  );
};

export default Tab;
