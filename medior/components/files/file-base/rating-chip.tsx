import Color from "color";
import { IconName } from "medior/components";
import { colors, CSS, getConfig, makeClasses } from "medior/utils/client";
import { Chip, ChipProps } from "./chip";

export const getRatingMeta = (rating: number) => {
  const icon: IconName = rating > 0 ? "Star" : "StarOutline";
  const iconColor =
    rating >= 7
      ? Color(colors.custom.orange).lighten(0.2).string()
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
      {...{ icon, iconColor }}
      label={rating}
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
