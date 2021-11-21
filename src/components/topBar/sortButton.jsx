import React, { useContext } from "react";
import { IconButton, colors } from "@mui/material";
import { makeStyles } from "utils";
import { KeyboardArrowDown, KeyboardArrowUp } from "@mui/icons-material";
import { AppContext } from "app";

const SortButton = ({ attribute, dir }) => {
  const { sortKey, setSortKey, sortDir, setSortDir } = useContext(AppContext);

  const { classes: css } = useClasses({ isActive: attribute === sortKey && dir === sortDir });

  const updateSort = (dir) => {
    if (sortKey !== attribute) {
      localStorage.setItem("sortKey", attribute);
      setSortKey(attribute);
    }

    if (sortDir !== dir) {
      localStorage.setItem("sortDir", dir);
      setSortDir(dir);
    }
  };

  return (
    <IconButton onClick={() => updateSort(dir)} className={css.button} size="small">
      {dir === "desc" ? <KeyboardArrowDown /> : <KeyboardArrowUp />}
    </IconButton>
  );
};

export default SortButton;

const useClasses = makeStyles()((_, { isActive }) => ({
  attribute: {
    flex: 1,
  },
  button: {
    marginLeft: "0.5rem",
    backgroundColor: isActive ? colors.blue["800"] : colors.grey["700"],
    "&:hover": {
      backgroundColor: isActive ? colors.blue["700"] : colors.grey["600"],
    },
  },
}));
