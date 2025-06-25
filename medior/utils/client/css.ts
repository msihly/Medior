// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { colors as muiColors } from "@mui/material";
import { Theme, useTheme } from "@mui/material/styles";
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { createMakeAndWithStyles, CSSObject, Cx } from "tss-react";

export type CSS = CSSObject;

export type Borders = {
  all?: CSS["border"];
  top?: CSS["borderTop"];
  bottom?: CSS["borderBottom"];
  right?: CSS["borderRight"];
  left?: CSS["borderLeft"];
};

export const makeBorders = (props: Borders) => ({
  border: props?.all,
  borderTop: props?.top,
  borderBottom: props?.bottom,
  borderRight: props?.right,
  borderLeft: props?.left,
});

export type BorderRadiuses = {
  all?: CSS["borderRadius"];
  bottomLeft?: CSS["borderBottomLeftRadius"];
  bottomRight?: CSS["borderBottomRightRadius"];
  topLeft?: CSS["borderTopLeftRadius"];
  topRight?: CSS["borderTopRightRadius"];
  /** Covers two corners */
  bottom?: CSS["borderTopRightRadius"];
  left?: CSS["borderTopRightRadius"];
  right?: CSS["borderTopRightRadius"];
  top?: CSS["borderTopRightRadius"];
};

export const makeBorderRadiuses = (radiuses: BorderRadiuses) => ({
  borderTopLeftRadius: radiuses?.topLeft ?? radiuses?.top ?? radiuses?.left ?? radiuses?.all,
  borderTopRightRadius: radiuses?.topRight ?? radiuses?.top ?? radiuses?.right ?? radiuses?.all,
  borderBottomLeftRadius:
    radiuses?.bottomLeft ?? radiuses?.bottom ?? radiuses?.left ?? radiuses?.all,
  borderBottomRightRadius:
    radiuses?.bottomRight ?? radiuses?.bottom ?? radiuses?.right ?? radiuses?.all,
});

export type Margins = {
  all?: CSS["margin"];
  top?: CSS["marginTop"];
  bottom?: CSS["marginBottom"];
  right?: CSS["marginRight"];
  left?: CSS["marginLeft"];
};

export const makeMargins = (props: Margins) => ({
  margin: props?.all,
  marginTop: props?.top,
  marginBottom: props?.bottom,
  marginRight: props?.right,
  marginLeft: props?.left,
});

export type Padding = {
  all?: CSS["padding"];
  top?: CSS["paddingTop"];
  bottom?: CSS["paddingBottom"];
  right?: CSS["paddingRight"];
  left?: CSS["paddingLeft"];
};

export const makePadding = (props: Padding) => ({
  padding: props?.all,
  paddingTop: props?.top,
  paddingBottom: props?.bottom,
  paddingRight: props?.right,
  paddingLeft: props?.left,
});

type ClassName<T> = { [P in keyof T]: CSS };

const { makeStyles } = createMakeAndWithStyles({ useTheme });

export const makeClasses = <Class extends ClassName<Class>, Props = Record<string, any>>(
  fnOrObj: ClassName<Class> | ((props: Props, theme: Theme) => ClassName<Class>),
) => {
  return (params: Props) => {
    const { classes: css, cx } = makeStyles<Props>()((props, theme) =>
      typeof fnOrObj === "function" ? fnOrObj(theme, props) : fnOrObj,
    )(params);

    return { css, cx } as { css: Record<keyof Class, string>; cx: Cx };
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
  orange: "#ad6a27",
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
