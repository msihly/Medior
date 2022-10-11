import { TextField, TextFieldProps } from "@mui/material";
import { Text } from "components";
import { CSSObject } from "tss-react";
import { makeClasses } from "utils";
import Color from "color";

interface InputProps extends Omit<TextFieldProps, "color" | "onChange" | "helperText"> {
  className?: string;
  color?: string;
  helperText?: string;
  setValue?: (value: any) => void;
  textAlign?: CSSObject["textAlign"];
  value?: any;
}

export const Input = ({
  className,
  color,
  helperText,
  setValue,
  textAlign,
  value,
  variant = "outlined",
  ...props
}: InputProps) => {
  const { classes: css, cx } = useClasses({ color, hasHelperText: !!helperText, textAlign });

  return (
    <TextField
      {...props}
      {...{ value, variant }}
      onChange={(event) => setValue?.(event.target.value)}
      size="small"
      helperText={helperText ? <Text>{helperText}</Text> : undefined}
      className={cx(css.input, className)}
    />
  );
};

const useClasses = makeClasses((_, { color, hasHelperText, textAlign }) => ({
  input: {
    marginBottom: hasHelperText ? 0 : "1.3em",
    "& input": {
      textAlign,
    },
    "& .MuiOutlinedInput-root": {
      "& fieldset": {
        transition: "all 200ms ease-in-out",
        borderColor: color,
      },
      "&:hover fieldset": {
        borderColor: color ? Color(color).lighten(0.3).toString() : undefined,
      },
      "&.Mui-focused fieldset": {
        borderColor: color,
      },
    },
    "& .MuiFormHelperText-root": {
      margin: "0.25em 0 0 0",
      color: color,
      fontSize: "0.75em",
      lineHeight: 1.5,
      textAlign: "center",
    },
  },
}));
