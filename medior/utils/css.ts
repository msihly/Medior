// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { colors as muiColors } from "@mui/material";
import { Theme, useTheme } from "@mui/material/styles";
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { createMakeAndWithStyles, CSSObject, Cx } from "tss-react";

export type CSS = CSSObject;

export type Margins = {
  all?: CSS["margin"];
  top?: CSS["marginTop"];
  bottom?: CSS["marginBottom"];
  right?: CSS["marginRight"];
  left?: CSS["marginLeft"];
};

export type Padding = {
  all?: CSS["padding"];
  top?: CSS["paddingTop"];
  bottom?: CSS["paddingBottom"];
  right?: CSS["paddingRight"];
  left?: CSS["paddingLeft"];
};

type ClassName<T> = { [P in keyof T]: CSS };

const { makeStyles } = createMakeAndWithStyles({ useTheme });

export const makeClasses = <T extends ClassName<T>, P = Record<string, any>>(
  fnOrObj: ClassName<T> | ((theme: Theme, props: P) => ClassName<T>)
) => {
  return (params: P) => {
    const { classes: css, cx } = makeStyles<P>()(fnOrObj)(params);
    return { css, cx } as { css: Record<keyof T, string>; cx: Cx };
  };
};

const customColors = {
  black: "#131313",
  blue: "#2866c5",
  blueGrey: "#546e7a",
  brown: "#6d4c41",
  darkGrey: "#2b2b2b",
  green: "#2e7d32",
  grey: "#4b4b4b",
  lightBlue: "#578cdd",
  lightGrey: "#bdbdbd",
  orange: "#f57c00",
  purple: "#683980",
  red: "#982525",
  white: "#f5f5f5",
};

export const colors = {
  mui: muiColors,
  custom: customColors,
  background: "#1E1E1E",
  foreground: "#2C2C2C",
  foregroundCard: "#343434",
};
