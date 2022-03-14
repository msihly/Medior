import { TextField } from "@mui/material";
import { makeStyles } from "utils";

const Input = ({ className = null, setValue, value, ...props }) => {
  const { classes: css, cx } = useClasses();

  return (
    <TextField
      value={value}
      onChange={(event) => setValue(event.target.value)}
      className={cx(css.input, className)}
      size="small"
      {...props}
    />
  );
};

export default Input;

const useClasses = makeStyles()(() => ({
  input: {
    marginBottom: "0.5rem",
  },
}));
