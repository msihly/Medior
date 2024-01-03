// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { colors as muiColors } from "@mui/material";
import { Theme, useTheme } from "@mui/material/styles";
import Color from "color";
import { createMakeAndWithStyles, CSSObject, Cx } from "tss-react";

export type Margins = {
  all?: CSSObject["margin"];
  top?: CSSObject["marginTop"];
  bottom?: CSSObject["marginBottom"];
  right?: CSSObject["marginRight"];
  left?: CSSObject["marginLeft"];
};

export type Padding = {
  all?: CSSObject["padding"];
  top?: CSSObject["paddingTop"];
  bottom?: CSSObject["paddingBottom"];
  right?: CSSObject["paddingRight"];
  left?: CSSObject["paddingLeft"];
};

type ClassName<T> = { [P in keyof T]: CSSObject };

const { makeStyles } = createMakeAndWithStyles({ useTheme });

export const makeClasses = <T extends ClassName<T>, P = Record<string, any>>(
  fnOrObj: ClassName<T> | ((theme: Theme, props: P) => ClassName<T>)
) => {
  return (params: P) => {
    const { classes: css, cx } = makeStyles<P>()(fnOrObj)(params);
    return { css, cx } as { css: Record<keyof T, string>; cx: Cx };
  };
};

export const colors = {
  ...muiColors,
  button: {
    blue: muiColors.blue["800"],
    grey: muiColors.grey["700"],
    darkGrey: "rgb(40 40 40)",
    purple: muiColors.purple["700"],
    red: muiColors.red["900"],
  },
  darkGrey: Color(muiColors.grey["900"]).darken(0.4).string(),
  error: muiColors.red["900"],
  primary: muiColors.blue["800"],
  success: muiColors.green["800"],
  text: {
    black: muiColors.grey["900"],
    blue: muiColors.blue["800"],
    grey: muiColors.grey["500"],
    red: muiColors.red["900"],
    white: muiColors.grey["100"],
  },
};
