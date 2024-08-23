import { ChangeEvent, forwardRef, MutableRefObject, ReactNode } from "react";
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { TextField, TextFieldProps } from "@mui/material";
import { ConditionalWrap, Text, TextProps, View } from "medior/components";
import { CSS, makeClasses, Margins } from "medior/utils";
import Color from "color";

export interface InputProps extends Omit<TextFieldProps, "color" | "onChange" | "helperText"> {
  className?: string;
  color?: string;
  detachLabel?: boolean;
  flex?: CSS["flex"];
  hasHelper?: boolean;
  helperText?: ReactNode;
  labelProps?: Partial<TextProps>;
  margins?: Margins;
  maxLength?: number;
  setValue?: (value: string) => void;
  textAlign?: CSS["textAlign"];
  value?: string;
  width?: CSS["width"];
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
  flex: CSS["flex"];
  hasHelper: boolean;
  hasHelperText: boolean;
  hasOnClick: boolean;
  margins: Margins;
  textAlign: CSS["textAlign"];
  width: CSS["width"];
}

const useClasses = makeClasses((_, props?: ClassesProps) => ({
  container: {
    flex: props?.flex,
    width: props?.width,
  },
  input: {
    flex: props?.flex,
    margin: props?.margins?.all,
    marginTop: props?.margins?.top,
    marginBottom:
      props?.margins?.bottom ?? (props?.hasHelper && !props?.hasHelperText ? "1.3em" : 0),
    marginRight: props?.margins?.right,
    marginLeft: props?.margins?.left,
    width: props?.width,
    "& input": {
      borderRadius: "inherit",
      textAlign: props?.textAlign,
      cursor: props?.hasOnClick ? "pointer" : undefined,
    },
    "& .MuiTypography-root": {
      textAlign: props?.textAlign,
    },
    "& .MuiOutlinedInput-root": {
      background: "rgb(0 0 0 / 0.2)",
      "& fieldset": {
        transition: "all 200ms ease-in-out",
        borderColor: props?.color,
        borderStyle: "dotted",
      },
      "&:hover fieldset": {
        borderColor: props?.color ? Color(props?.color).lighten(0.3).toString() : undefined,
      },
      "&.Mui-focused fieldset": {
        borderColor: props?.color,
      },
    },
    "& .MuiFormHelperText-root": {
      margin: "0.3em 0 0 0",
      color: props?.color,
      fontSize: "0.75em",
      lineHeight: 1,
      textAlign: "center",
    },
  },
}));
