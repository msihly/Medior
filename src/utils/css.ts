import { Theme, useTheme } from "@mui/material/styles";
import { createMakeAndWithStyles, CSSObject } from "tss-react";

export const { makeStyles, withStyles } = createMakeAndWithStyles({ useTheme });

export const makeClasses = (
  fnOrObj:
    | Record<string, CSSObject>
    | ((theme: Theme, props: { [x: string]: any }) => Record<string, CSSObject>)
) => {
  return makeStyles<CSSObject>()(fnOrObj);
};
