import { TextField, TextFieldProps } from "@mui/material";
import { CSSObject } from "tss-react";
import { makeClasses } from "utils";

interface InputProps extends Omit<TextFieldProps, "onChange"> {
  className?: string;
  setValue?: (value: any) => void;
  textAlign?: CSSObject["textAlign"];
  value?: any;
}

const Input = ({
  className,
  setValue,
  textAlign,
  value,
  variant = "outlined",
  ...props
}: InputProps) => {
  const { classes: css, cx } = useClasses({ textAlign });

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

const useClasses = makeClasses((_, { textAlign }) => ({
  input: {
    marginBottom: "0.5rem",
    "& input": {
      textAlign,
    },
  },
}));
