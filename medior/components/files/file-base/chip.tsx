import { Chip as ChipBase, ChipProps as ChipBaseProps } from "medior/components";
import { colors, makeClasses } from "medior/utils/client";

export interface ChipProps extends ChipBaseProps {
  hasFooter?: boolean;
  opacity?: number;
  position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
}

export const Chip = ({
  bgColor = colors.background,
  hasFooter,
  opacity = 0.6,
  position,
  ...props
}: ChipProps) => {
  const { css } = useClasses({ hasFooter, opacity, position });

  return <ChipBase {...props} {...{ bgColor }} className={css.chip} />;
};

interface ClassesProps {
  hasFooter: boolean;
  opacity: number;
  position: ChipProps["position"];
}

const useClasses = makeClasses((props: ClassesProps) => ({
  chip: {
    position: "absolute",
    top: props.position.includes("top") ? "0.3rem" : undefined,
    right: props.position.includes("right") ? "0.3rem" : undefined,
    bottom: props.position.includes("bottom") ? (props.hasFooter ? "2rem" : "0.3rem") : undefined,
    left: props.position.includes("left") ? "0.3rem" : undefined,
    cursor: "pointer",
    opacity: props.opacity,
    "&:hover": { opacity: Math.min(1, props.opacity + 0.3) },
  },
}));
