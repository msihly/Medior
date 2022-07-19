import { useState } from "react";
import { colors, Menu } from "@mui/material";
import { Button, View } from "components";
import { SortRow } from ".";

const SortMenu = () => {
  const [anchorEl, setAnchorEl] = useState(null);

  const handleOpen = (event) => setAnchorEl(event.currentTarget);

  const handleClose = () => setAnchorEl(null);

  return (
    <>
      <Button text="Sort" iconEnd="Sort" onClick={handleOpen} color={colors.grey["700"]} />

      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleClose} keepMounted>
        <View>
          <SortRow label="Date Modified" attribute="dateModified" icon="DateRange" />
          <SortRow label="Date Created" attribute="dateCreated" icon="DateRange" />
          <SortRow label="Name" attribute="originalName" icon="SortByAlpha" />
          <SortRow label="Size" attribute="size" icon="FormatSize" />
          <SortRow label="Rating" attribute="rating" icon="Star" />
        </View>
      </Menu>
    </>
  );
};

export default SortMenu;
