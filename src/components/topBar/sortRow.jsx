import React from "react";
import { Typography } from "@mui/material";
import { makeStyles } from "utils";
import { SortButton } from ".";

const SortRow = ({ attribute, label }) => {
  const { classes: css } = useClasses();

  return (
    <div className={css.row}>
      <Typography className={css.label}>{label}</Typography>
      <SortButton {...{ attribute }} dir="desc" />
      <SortButton {...{ attribute }} dir="asc" />
    </div>
  );
};

export default SortRow;

const useClasses = makeStyles()({
  label: {
    flex: 1,
    whiteSpace: "nowrap",
    padding: "0 0.5rem",
  },
  row: {
    display: "flex",
    flexFlow: "row nowrap",
    alignItems: "center",
    padding: "0.5rem",
  },
});
