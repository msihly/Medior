import { TextField, TextFieldProps } from "@mui/material";
import { makeClasses } from "utils";

interface InputProps extends Omit<TextFieldProps, "onChange"> {
  className?: string;
  setValue?: (value: any) => void;
  value?: any;
}

const Input = ({ className, setValue, value, variant = "outlined", ...props }: InputProps) => {
  const { classes: css, cx } = useClasses(null);

  return (
    <TextField
      {...{ value, variant }}
      onChange={(event) => setValue(event.target.value)}
      className={cx(css.input, className)}
      size="small"
      {...props}
    />
  );
};

export default Input;

const useClasses = makeClasses({
  input: {
    marginBottom: "0.5rem",
  },
});
