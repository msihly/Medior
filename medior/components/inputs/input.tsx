import { ChangeEvent, forwardRef, MutableRefObject, ReactNode } from "react";
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { TextField, TextFieldProps } from "@mui/material";
import { HeaderWrapper, HeaderWrapperProps, Text } from "medior/components";
import {
  BorderRadiuses,
  Borders,
  CSS,
  deepMerge,
  makeBorderRadiuses,
  makeBorders,
  makeClasses,
  makeMargins,
  Margins,
} from "medior/utils";
import Color from "color";

const DEFAULT_HEADER_PROPS: HeaderWrapperProps["headerProps"] = {
  fontSize: "0.8em",
  padding: { all: "0.15rem 0.3rem" },
};

export interface InputProps
  extends Omit<TextFieldProps, "color" | "fullWidth" | "onChange" | "helperText" | "label"> {
  borders?: Borders;
  borderRadiuses?: BorderRadiuses;
  className?: string;
  color?: string;
  dense?: boolean;
  flex?: CSS["flex"];
  hasHelper?: boolean;
  header?: HeaderWrapperProps["header"];
  headerProps?: HeaderWrapperProps["headerProps"];
  helperText?: ReactNode;
  margins?: Margins;
  maxLength?: number;
  minWidth?: CSS["minWidth"];
  setValue?: (value: string) => void;
  textAlign?: CSS["textAlign"];
  value?: string;
  width?: CSS["width"];
}

export const Input = forwardRef(
  (
    {
      borders,
      borderRadiuses,
      children,
      className,
      color,
      dense = false,
      flex,
      hasHelper = false,
      header,
      headerProps = {},
      helperText,
      inputProps,
      margins = {},
      maxLength,
      minWidth,
      onClick,
      onKeyDown,
      setValue,
      textAlign,
      value,
      variant = "outlined",
      width = "100%",
      ...props
    }: InputProps,
    ref?: MutableRefObject<HTMLDivElement>
  ) => {
    headerProps = deepMerge(DEFAULT_HEADER_PROPS, headerProps);

    const { css, cx } = useClasses({
      borders,
      borderRadiuses,
      color,
      dense,
      flex,
      hasHeader: header !== undefined,
      hasHelper,
      hasHelperText: !!helperText,
      hasOnClick: !!onClick,
      margins,
      minWidth,
      textAlign,
      width,
    });

    const handleChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setValue?.(event.target.value);

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
      event.stopPropagation();
      onKeyDown?.(event);
    };

    return (
      <HeaderWrapper
        {...{ flex, header, headerProps, width }}
        overflow="hidden"
        aria-label="input-wrapper"
      >
        <TextField
          {...props}
          {...{ onClick, ref, value, variant }}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          helperText={
            helperText ? (
              typeof helperText === "string" ? (
                <Text>{helperText}</Text>
              ) : (
                helperText
              )
            ) : undefined
          }
          // @ts-expect-error
          FormHelperTextProps={{ component: "div" }}
          inputProps={{ ...inputProps, maxLength, value: value ?? "" }}
          size="small"
          className={cx(css.input, className)}
          aria-label="input"
        >
          {children}
        </TextField>
      </HeaderWrapper>
    );
  }
);

interface ClassesProps {
  borders: Borders;
  borderRadiuses: BorderRadiuses;
  color: string;
  dense: boolean;
  flex: CSS["flex"];
  hasHeader: boolean;
  hasHelper: boolean;
  hasHelperText: boolean;
  hasOnClick: boolean;
  margins: Margins;
  minWidth: CSS["minWidth"];
  textAlign: CSS["textAlign"];
  width: CSS["width"];
}

const useClasses = makeClasses((props: ClassesProps) => ({
  input: {
    flex: props.flex,
    ...makeMargins({
      ...props.margins,
      bottom: props.margins?.bottom ?? (props.hasHelper && !props.hasHelperText ? "1.3em" : 0),
    }),
    minWidth: props.minWidth,
    width: "100%",
    "& input": {
      borderRadius: "inherit",
      padding: props.dense ? "0.2em 0.5em" : undefined,
      textAlign: props.textAlign,
      cursor: props.hasOnClick ? "pointer" : undefined,
    },
    "& .MuiTypography-root": {
      textAlign: props.textAlign,
    },
    "& .MuiOutlinedInput-root": {
      background: "rgb(0 0 0 / 0.2)",
      "& fieldset": {
        transition: "all 200ms ease-in-out",
        borderColor: props.color,
        borderStyle: "dotted",
        ...makeBorders(props.borders),
        ...makeBorderRadiuses(
          deepMerge(props.hasHeader ? { top: 0 } : {}, props.borderRadiuses ?? {})
        ),
      },
      "&:hover fieldset": {
        borderColor: props.color ? Color(props.color).lighten(0.3).toString() : undefined,
      },
      "&.Mui-focused fieldset": {
        borderColor: props.color,
      },
    },
    "& .MuiSelect-select": {
      fontSize: "0.9em",
    },
    "& .MuiFormHelperText-root": {
      margin: "0.3em 0 0 0",
      color: props.color,
      fontSize: "0.75em",
      lineHeight: 1,
      textAlign: "center",
    },
  },
}));
