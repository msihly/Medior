import { Avatar, Chip, colors } from "@mui/material";
import { makeStyles } from "utils";

const Tag = ({ count, ...props }) => {
  const { classes: css } = useClasses();

  return (
    <Chip avatar={<Avatar className={css.count}>{count}</Avatar>} className={css.chip} {...props} />
  );
};

export default Tag;

const useClasses = makeStyles()({
  chip: {
    marginRight: "0.2em",
  },
  count: {
    backgroundColor: colors.blue["800"],
  },
});
