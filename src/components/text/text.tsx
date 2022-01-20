import { Typography } from "@mui/material";
import { CSSObject } from "@emotion/react";
import { makeClassName, makeStyles } from "utils";

const Text = ({ bold = false, children, className = null, component = "span", ...props }) => {
  const { classes: css } = useClasses({ bold });

  return (
    <Typography {...{ component }} {...props} className={makeClassName(css.root, className)}>
      {children}
    </Typography>
  );
};

export default Text;

const useClasses = makeStyles<CSSObject>()((_, { bold }: any) => ({
  root: {
    fontWeight: bold ? "bold" : "normal",
  },
}));
