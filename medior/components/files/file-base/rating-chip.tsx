import Color from "color";
import { IconName } from "medior/components";
import { colors, CSS, CssColor, makeClasses } from "medior/utils/client";
import { round } from "medior/utils/common";
import { getConfig } from "medior/utils/server";
import { Chip, ChipProps } from "./chip";

export const getRatingMeta = (rating: number) => {
  const icon: IconName = rating > 0 ? "Star" : "StarOutline";
  const iconColor: CssColor =
    rating >= 7
      ? (Color(colors.custom.orange).lighten(0.2).string() as CssColor)
      : rating >= 4
        ? colors.custom.lightGrey
        : colors.custom.brown;
  const textShadow = /^[235689]/.test(String(rating))
    ? `0px 0px ${/^[369]/.test(String(rating)) ? "7px" : "2px"} ${iconColor}`
    : undefined;
  return { icon, iconColor, textShadow };
};

interface RatingChipProps extends Omit<ChipProps, "label"> {
  noHide?: boolean;
  rating: number;
}

export const RatingChip = ({ noHide = false, rating, ...props }: RatingChipProps) => {
  const config = getConfig();

  const { icon, iconColor, textShadow } = getRatingMeta(rating);

  const { css } = useClasses({ textShadow });

  return noHide || rating > 0 || !config.file.hideUnratedIcon ? (
    <Chip
      label={round(rating, 1)}
      color={colors.custom.lightGrey}
      fontWeight={600}
      icon={icon}
      iconColor={iconColor}
      iconProps={{ className: css.star }}
      opacity={1}
      {...props}
    />
  ) : null;
};

interface ClassesProps {
  textShadow: CSS["textShadow"];
}

const useClasses = makeClasses((props: ClassesProps) => ({
  star: {
    textShadow: props.textShadow,
  },
}));
