import { CSSObject } from "@emotion/react";
import { makeClassName, makeStyles } from "utils";

const View = ({ children, className = null, column = false, ...props }) => {
  const { classes: css } = useClasses({ column });

  return (
    <div className={makeClassName(css.root, className)} {...props}>
      {children}
    </div>
  );
};

export default View;

const useClasses = makeStyles<CSSObject>()((_, { column }: any) => ({
  root: {
    display: "flex",
    flexDirection: column ? "column" : "row",
  },
}));
