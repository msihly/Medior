import { ChangeEvent, forwardRef, MutableRefObject, ReactNode } from "react";
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { TextField, TextFieldProps } from "@mui/material";
import { Text } from "components";
import { CSSObject } from "tss-react";
import { colors, makeClasses, Margins } from "utils";
import Color from "color";

export interface InputProps extends Omit<TextFieldProps, "color" | "onChange" | "helperText"> {
  className?: string;
  color?: string;
  flexShrink?: CSSObject["flexShrink"];
  hasHelper?: boolean;
  helperText?: ReactNode;
  margins?: Margins;
  maxLength?: number;
  setValue?: (value: string) => any;
  textAlign?: CSSObject["textAlign"];
  value?: TextFieldProps["value"];
  width?: CSSObject["width"];
}

export const Input = forwardRef(
  (
    {
      children,
      className,
      color,
      flexShrink,
      hasHelper = false,
      helperText,
      inputProps,
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
      flexShrink,
      hasHelper,
      hasHelperText: !!helperText,
      margins,
      textAlign,
      width,
    });

    const handleChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setValue?.(event.target.value);

    return (
      <TextField
        {...props}
        {...{ value, variant }}
        ref={ref}
        onChange={handleChange}
        helperText={
          helperText ? (
            typeof helperText === "string" ? (
              <Text>{helperText}</Text>
            ) : (
              helperText
            )
          ) : undefined
        }
        FormHelperTextProps={{ component: "div" }}
        inputProps={{ ...inputProps, maxLength, value: value ?? "" }}
        size="small"
        className={cx(css.input, className)}
      >
        {children}
      </TextField>
    );
  }
);

const useClasses = makeClasses(
  (_, { color, flexShrink, hasHelper, hasHelperText, margins, textAlign, width }) => ({
    input: {
      flexShrink,
      margin: margins.all,
      marginTop: margins.top,
      marginBottom: margins.bottom ?? (hasHelper && !hasHelperText ? "1.3em" : 0),
      marginRight: margins.right,
      marginLeft: margins.left,
      width,
      "& input": {
        textAlign,
      },
      "& .MuiTypography-root": {
        textAlign,
      },
      "& .MuiOutlinedInput-root": {
        backgroundColor: Color(colors.grey["900"]).fade(0.7).string(),
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
        margin: "0.3em 0 0 0",
        color: color,
        fontSize: "0.75em",
        lineHeight: 1,
        textAlign: "center",
      },
    },
  })
);
