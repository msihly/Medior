import { makeClasses } from "utils";

const View = ({ children, className = null, column = false, ...props }) => {
  const { classes: css, cx } = useClasses({ column });

  return (
    <div className={cx(css.root, className)} {...props}>
      {children}
    </div>
  );
};

export default View;

const useClasses = makeClasses((_, { column }) => ({
  root: {
    display: "flex",
    flexDirection: column ? "column" : "row",
  },
}));
