import { Theme, useTheme } from "@mui/material/styles";
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

export const makeClasses = <T extends ClassName<T>>(
  fnOrObj: ClassName<T> | ((theme: Theme, props: Record<string, any>) => ClassName<T>)
) => {
  return (params: CSSObject | Record<string, any>) => {
    const { classes: css, cx } = makeStyles<typeof params>()(fnOrObj)(params);
    return { css, cx } as { css: Record<keyof T, string>; cx: Cx };
  };
};