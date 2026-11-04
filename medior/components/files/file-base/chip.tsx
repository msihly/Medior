import { Chip as ChipBase, ChipProps as ChipBaseProps } from "medior/components";
import { colors, CSS, makeClasses } from "medior/utils/client";

export interface ChipProps extends ChipBaseProps {
  flush?: boolean;
  footerOffset?: CSS["bottom"];
  hasFooter?: boolean;
  opacity?: number;
  position?: "bottom-left" | "bottom-right" | "top-left" | "top-right";
}

export const Chip = ({
  bgColor = colors.background,
  flush = false,
  footerOffset,
  hasFooter,
  opacity = 0.6,
  position,
  ...props
}: ChipProps) => {
  const { css } = useClasses({ flush, footerOffset, hasFooter, opacity, position });

  return <ChipBase {...props} {...{ bgColor }} className={css.chip} />;
};

interface ClassesProps extends Pick<
  ChipProps,
  "flush" | "footerOffset" | "hasFooter" | "opacity" | "position"
> {}

const useClasses = makeClasses((props: ClassesProps) => ({
  chip: {
    "&:hover": { opacity: Math.min(1, props.opacity + 0.3) },
    bottom: props.position?.includes("bottom")
      ? (props.footerOffset ?? (props.hasFooter ? "2rem" : props.flush ? 0 : "0.3rem"))
      : undefined,
    cursor: "pointer",
    left: props.position?.includes("left") ? (props.flush ? 0 : "0.3rem") : undefined,
    opacity: props.opacity,
    position: props.position ? "absolute" : undefined,
    right: props.position?.includes("right") ? (props.flush ? 0 : "0.3rem") : undefined,
    top: props.position?.includes("top") ? (props.flush ? 0 : "0.3rem") : undefined,
  },
}));
