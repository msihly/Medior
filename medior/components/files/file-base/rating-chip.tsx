import Color from "color";
import { Button, IconName } from "medior/components";
import { useStores } from "medior/store";
import { colors, CSS, CssColor, makeClasses } from "medior/utils/client";
import { round } from "medior/utils/common";
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
  button?: boolean;
  noHide?: boolean;
  rating: number;
}

export const RatingChip = ({
  button = false,
  noHide = false,
  rating,
  ...props
}: RatingChipProps) => {
  const stores = useStores();

  const { icon, iconColor, textShadow } = getRatingMeta(rating);

  const { css } = useClasses({ textShadow });

  if (!noHide && rating === 0 && stores.home.settings.file.hideUnratedIcon) return null;

  return button ? (
    <Button
      text={rating === 0 ? "Rate" : round(rating, 1)}
      icon="Star"
      iconProps={{ color: colors.custom.white }}
      color={colors.custom.grey}
      onClick={(event) => props.onClick?.(event as unknown as React.MouseEvent<HTMLDivElement>)}
    />
  ) : (
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
  );
};

interface ClassesProps {
  textShadow: CSS["textShadow"];
}

const useClasses = makeClasses((props: ClassesProps) => ({
  star: {
    textShadow: props.textShadow,
  },
}));
