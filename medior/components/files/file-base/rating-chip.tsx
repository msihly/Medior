import { IconName } from "medior/components";
import { Chip, ChipProps } from "./chip";
import { CSS, colors, getConfig, makeClasses } from "medior/utils";

export const getRatingMeta = (rating: number) => {
  const icon: IconName = rating > 0 ? "Star" : "StarOutline";
  const iconColor =
    rating >= 7 ? colors.custom.orange : rating >= 4 ? colors.custom.lightGrey : colors.custom.brown;
  const textShadow = /^[235689]/.test(String(rating))
    ? `0px 0px ${/^[369]/.test(String(rating)) ? "7px" : "2px"} ${iconColor}`
    : undefined;
  return { icon, iconColor, textShadow };
};

interface RatingChipProps extends Omit<ChipProps, "label"> {
  rating: number;
}

export const RatingChip = ({ rating, ...props }: RatingChipProps) => {
  const config = getConfig();

  const { icon, iconColor, textShadow } = getRatingMeta(rating);

  const { css } = useClasses({ textShadow });

  return rating > 0 || !config.file.hideUnratedIcon ? (
    <Chip {...{ icon, iconColor }} label={rating} iconProps={{ className: css.star }} {...props} />
  ) : null;
};

const useClasses = makeClasses((props: { textShadow: CSS["textShadow"] }) => ({
  star: {
    textShadow: props.textShadow,
  },
}));
