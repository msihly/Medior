import React from "react";
import { AppBar, TabContext, TabList } from "@mui/material";

const Tabs = ({ activeTab, children, setActiveTab, appBarProps = {}, ...props }) => {
  return (
    <TabContext value={activeTab}>
      <AppBar position="relative" {...appBarProps}>
        <TabList onChange={(val) => setActiveTab(val)} {...props}>
          {children}
        </TabList>
      </AppBar>
    </TabContext>
  );
};

export default Tabs;
