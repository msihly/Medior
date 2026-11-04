import Color from "color";
import type { IconName } from "trabecula/components";
import type { CssColor } from "trabecula/utils/client";

export interface RatingLevel {
  /** Pixels of glow around the icon, in the icon's color. */
  glow: number;
  icon: IconName | null;
  iconColor: CssColor | null;
  /** "{rating}" shows the rating itself. */
  text: string;
  /** Empty uses the surrounding text color. */
  textColor: CssColor | null;
}

export interface RatingDisplay {
  /** One level per rating, from unrated to 9. */
  levels: RatingLevel[];
  /** Corners sit flush against the card's corner instead of floating as a chip. */
  shape: "chip" | "corner";
}

const STAR_BROWN = "#6d4c41";
const STAR_GOLD = Color("#ad6a27").lighten(0.2).hex() as CssColor;
const STAR_GREY = "#bdbdbd";

/** Letter colors step through hue at a steady lightness, fading toward grey as ratings drop. */
const hsl = (hue: number, saturation: number, lightness: number) =>
  Color.hsl(hue, saturation, lightness).hex() as CssColor;

export const STARS_RATING_DISPLAY: RatingDisplay = {
  levels: [
    { glow: 0, icon: "StarOutline", iconColor: STAR_BROWN, text: "{rating}", textColor: null },
    { glow: 0, icon: "Star", iconColor: STAR_BROWN, text: "{rating}", textColor: null },
    { glow: 2, icon: "Star", iconColor: STAR_BROWN, text: "{rating}", textColor: null },
    { glow: 5, icon: "Star", iconColor: STAR_BROWN, text: "{rating}", textColor: null },
    { glow: 0, icon: "Star", iconColor: STAR_GREY, text: "{rating}", textColor: null },
    { glow: 2, icon: "Star", iconColor: STAR_GREY, text: "{rating}", textColor: null },
    { glow: 5, icon: "Star", iconColor: STAR_GREY, text: "{rating}", textColor: null },
    { glow: 0, icon: "Star", iconColor: STAR_GOLD, text: "{rating}", textColor: null },
    { glow: 2, icon: "Star", iconColor: STAR_GOLD, text: "{rating}", textColor: null },
    { glow: 5, icon: "Star", iconColor: STAR_GOLD, text: "{rating}", textColor: null },
  ],
  shape: "chip",
};

export const LETTERS_RATING_DISPLAY: RatingDisplay = {
  levels: [
    { glow: 0, icon: null, iconColor: null, text: "-", textColor: null },
    { glow: 0, icon: null, iconColor: null, text: "F", textColor: hsl(0, 0, 50) },
    { glow: 0, icon: null, iconColor: null, text: "D", textColor: hsl(105, 32, 52) },
    { glow: 0, icon: null, iconColor: null, text: "C", textColor: hsl(145, 45, 48) },
    { glow: 0, icon: null, iconColor: null, text: "C+", textColor: hsl(198, 52, 50) },
    { glow: 0, icon: null, iconColor: null, text: "B", textColor: hsl(222, 58, 60) },
    { glow: 0, icon: null, iconColor: null, text: "B+", textColor: hsl(260, 62, 60) },
    { glow: 0, icon: null, iconColor: null, text: "A", textColor: hsl(285, 65, 55) },
    { glow: 0, icon: null, iconColor: null, text: "A+", textColor: hsl(4, 75, 55) },
    { glow: 0, icon: null, iconColor: null, text: "S", textColor: hsl(28, 80, 55) },
  ],
  shape: "corner",
};

export const RATING_DISPLAY_PRESETS: Array<{ label: string; value: RatingDisplay }> = [
  { label: "Stars + Number", value: STARS_RATING_DISPLAY },
  { label: "Letters", value: LETTERS_RATING_DISPLAY },
];
