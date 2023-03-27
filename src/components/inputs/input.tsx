import { colors, TextField, TextFieldProps } from "@mui/material";
import { Text } from "..";
import { CSSObject } from "tss-react";
import { makeClasses, Margins } from "../../utils";
import Color from "color";
import { forwardRef, MutableRefObject } from "react";

export interface InputProps extends Omit<TextFieldProps, "color" | "onChange" | "helperText"> {
  className?: string;
  color?: string;
  hasHelper?: boolean;
  helperText?: string;
  margins?: Margins;
  maxLength?: number;
  setValue?: (value: string) => any;
  textAlign?: CSSObject["textAlign"];
  value?: any;
  width?: CSSObject["width"];
}

export const Input = forwardRef(
  (
    {
      children,
      className,
      color,
      hasHelper = false,
      helperText,
      margins = {},
      maxLength,
      setValue,
      textAlign,
      value,
      variant = "outlined",
      width,
      ...props
    }: InputProps,
    ref?: MutableRefObject<HTMLDivElement>
  ) => {
    const { css, cx } = useClasses({
      color,
      hasHelper,
      hasHelperText: !!helperText,
      margins,
      textAlign,
      width,
    });

    return (
      <TextField
        {...props}
        {...{ value, variant }}
        ref={ref}
        onChange={(event) => setValue?.(event.target.value)}
        helperText={helperText ? <Text>{helperText}</Text> : undefined}
        inputProps={{ ...props.inputProps, maxLength }}
        size="small"
        className={cx(css.input, className)}
      >
        {children}
      </TextField>
    );
  }
);

const useClasses = makeClasses(
  (_, { bgColor, color, hasHelper, hasHelperText, margins, textAlign, width }) => ({
    input: {
      margin: margins.all,
      marginTop: margins.top,
      marginBottom: margins.bottom ?? (hasHelper && !hasHelperText ? "1.2em" : 0),
      marginRight: margins.right,
      marginLeft: margins.left,
      width: width,
      "& input": {
        textAlign,
      },
      "& .MuiTypography-root": {
        textAlign,
      },
      "& .MuiOutlinedInput-root": {
        backgroundColor: bgColor ?? Color(colors.grey["900"]).fade(0.7).string(),
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
  })
);
