import React, { useState } from "react";
import { Menu } from "@mui/material";
import { Button } from "components/buttons";
import { SortRow } from ".";

const SortMenu = () => {
  const [anchorEl, setAnchorEl] = useState(null);

  const handleOpen = (event) => setAnchorEl(event.currentTarget);

  const handleClose = () => setAnchorEl(null);

  return (
    <>
      <Button variant="text" onClick={handleOpen}>
        Sort
      </Button>
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleClose} keepMounted>
        <div>
          {/* <SortRow label="Date Modified" attribute="dateModified" /> */}
          <SortRow label="Date Created" attribute="dateCreated" />
          <SortRow label="Name" attribute="originalName" />
          <SortRow label="Size" attribute="size" />
          {/* <SortRow label="Rating" attribute="rating" /> */}
          {/* <SortRow label="Views" attribute="views" /> */}
        </div>
      </Menu>
    </>
  );
};

export default SortMenu;
