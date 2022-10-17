import { Theme, useTheme } from "@mui/material/styles";
import { createMakeAndWithStyles, CSSObject } from "tss-react";

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

const { makeStyles, withStyles } = createMakeAndWithStyles({ useTheme });

export const makeClasses = (
  fnOrObj:
    | Record<string, CSSObject>
    | ((theme: Theme, props: { [x: string]: any }) => Record<string, CSSObject>)
) => {
  return makeStyles<CSSObject>()(fnOrObj);
};
