import Color from "color";
import { colors, CssColor, getContrastText } from "trabecula/utils/client";

/** A translucent tint of the color, outlined in it, with text readable against the tint. */
export const getChipColors = (color: CssColor, opacity = 0.5) => {
  const tint = Color(color).lighten(0.2);

  return {
    background: tint.fade(1 - opacity).toString() as CssColor,
    border: `2px solid ${color}`,
    color: getContrastText(tint.mix(Color(colors.foreground), 0.5).hex() as CssColor),
  };
};
