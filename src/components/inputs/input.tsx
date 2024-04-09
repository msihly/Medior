import { ChangeEvent, forwardRef, MutableRefObject, ReactNode } from "react";
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { TextField, TextFieldProps } from "@mui/material";
import { ConditionalWrap, Text, TextProps, View } from "components";
import { CSSObject } from "tss-react";
import { colors, makeClasses, Margins } from "utils";
import Color from "color";

export interface InputProps extends Omit<TextFieldProps, "color" | "onChange" | "helperText"> {
  className?: string;
  color?: string;
  detachLabel?: boolean;
  flex?: CSSObject["flex"];
  hasHelper?: boolean;
  helperText?: ReactNode;
  labelProps?: Partial<TextProps>;
  margins?: Margins;
  maxLength?: number;
  setValue?: (value: string) => void;
  textAlign?: CSSObject["textAlign"];
  value?: string;
  width?: CSSObject["width"];
}

export const Input = forwardRef(
  (
    {
      children,
      className,
      color,
      detachLabel = false,
      flex,
      hasHelper = false,
      helperText,
      inputProps,
      label,
      labelProps = {},
      margins = {},
      maxLength,
      onClick,
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
      flex,
      hasHelper,
      hasHelperText: !!helperText,
      hasOnClick: !!onClick,
      margins,
      textAlign,
      width,
    });

    const handleChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setValue?.(event.target.value);

    return (
      <ConditionalWrap
        condition={detachLabel}
        wrap={(c) => (
          <View column className={css.container}>
            <Text preset="label-glow" {...labelProps}>
              {label}
            </Text>
            {c}
          </View>
        )}
      >
        <TextField
          {...props}
          {...{ onClick, ref, value, variant }}
          label={detachLabel ? undefined : label}
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
      </ConditionalWrap>
    );
  }
);

interface ClassesProps {
  color: string;
  flex: CSSObject["flex"];
  hasHelper: boolean;
  hasHelperText: boolean;
  hasOnClick: boolean;
  margins: Margins;
  textAlign: CSSObject["textAlign"];
  width: CSSObject["width"];
}

const useClasses = makeClasses(
  (
    _,
    { color, flex, hasHelper, hasHelperText, hasOnClick, margins, textAlign, width }: ClassesProps
  ) => ({
    container: {
      flex,
      width,
    },
    input: {
      margin: margins.all,
      marginTop: margins.top,
      marginBottom: margins.bottom ?? (hasHelper && !hasHelperText ? "1.3em" : 0),
      marginRight: margins.right,
      marginLeft: margins.left,
      width,
      "& input": {
        textAlign,
        cursor: hasOnClick ? "pointer" : undefined,
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
