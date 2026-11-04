import { Button, Comp } from "medior/components";
import { useStores } from "medior/store";
import { BorderRadiuses, colors, CSS, getChipColors, makeClasses } from "medior/utils/client";
import { RatingDisplay, round } from "medior/utils/common";
import { Chip, ChipProps } from "./chip";

/** Rounds only the corner facing into the card. */
const CORNER_RADIUSES: Record<ChipProps["position"], BorderRadiuses> = {
  "bottom-left": { bottom: 0, left: 0, topRight: "inherit" },
  "bottom-right": { bottom: 0, right: 0, topLeft: "inherit" },
  "top-left": { bottomRight: "inherit", left: 0, top: 0 },
  "top-right": { bottomLeft: "inherit", right: 0, top: 0 },
};

export const getRatingMeta = (rating: number, display: RatingDisplay) => {
  const index = Math.min(Math.max(Math.floor(rating ?? 0), 0), display.levels.length - 1);
  const level = display.levels[index];

  const text = level.text.replaceAll("{rating}", String(round(rating ?? 0, 1)));
  const textShadow =
    level.glow > 0 && level.iconColor
      ? `0px 0px ${level.glow}px ${level.iconColor}`
      : undefined;

  return {
    icon: level.icon,
    iconColor: level.iconColor,
    text,
    textColor: level.textColor,
    textShadow,
  };
};

interface RatingChipProps extends Omit<ChipProps, "label" | "onClick"> {
  button?: boolean;
  noHide?: boolean;
  onClick?: React.MouseEventHandler<HTMLButtonElement | HTMLDivElement>;
  rating: number;
}

export const RatingChip = Comp(
  ({ button = false, noHide = false, rating, ...props }: RatingChipProps) => {
    const stores = useStores();
    const store = stores.home.settings;

    const display = store.file.ratingDisplay;
    const isCorner = display.shape === "corner" && !!props.position;
    const { icon, iconColor, text, textColor, textShadow } = getRatingMeta(rating, display);
    const bgColor = textColor ? getChipColors(textColor, 0.25).background : undefined;

    const { css } = useClasses({ textShadow });

    if (!noHide && rating === 0 && store.file.hideUnratedIcon) return null;

    return button ? (
      <Button
        text={rating === 0 ? "Rate" : text}
        icon={rating === 0 ? "Star" : icon}
        iconProps={{ color: colors.custom.white }}
        textColor={textColor}
        onClick={props.onClick}
      />
    ) : (
      <Chip
        label={text}
        bgColor={bgColor}
        color={textColor ?? colors.custom.lightGrey}
        fontWeight={600}
        icon={icon}
        iconColor={iconColor}
        iconProps={{ className: css.star }}
        opacity={1}
        flush={isCorner}
        radiuses={isCorner ? CORNER_RADIUSES[props.position] : undefined}
        {...props}
      />
    );
  },
);

interface ClassesProps {
  textShadow: CSS["textShadow"];
}

const useClasses = makeClasses((props: ClassesProps) => ({
  star: {
    textShadow: props.textShadow,
  },
}));
