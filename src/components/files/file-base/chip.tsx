import { Chip as ChipBase, ChipProps as ChipBaseProps } from "components";
import { colors, makeClasses } from "utils";

interface ChipProps extends ChipBaseProps {
  opacity?: number;
  position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
}

export const Chip = ({
  bgColor = colors.grey["900"],
  opacity = 0.6,
  position,
  ...props
}: ChipProps) => {
  const { css } = useClasses({ opacity, position });

  return <ChipBase {...props} {...{ bgColor }} className={css.chip} />;
};

const useClasses = makeClasses((_, { opacity, position }) => ({
  chip: {
    position: "absolute",
    top: position.includes("top") ? "0.5rem" : undefined,
    right: position.includes("right") ? "0.5rem" : undefined,
    bottom: position.includes("bottom") ? "0.5rem" : undefined,
    left: position.includes("left") ? "0.5rem" : undefined,
    cursor: "pointer",
    opacity: opacity,
    "&:hover": { opacity: Math.min(1, opacity + 0.3) },
  },
}));
