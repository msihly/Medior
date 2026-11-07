import { Chip as ChipBase, ChipProps as ChipBaseProps } from "medior/components";
import { BorderRadiuses, colors, CSS, makeClasses } from "medior/utils/client";

export interface ChipProps extends ChipBaseProps {
  /** Sits flush against the card's corner, rounding only the corner facing into the card. */
  corner?: boolean;
  flush?: boolean;
  footerOffset?: CSS["bottom"];
  hasFooter?: boolean;
  opacity?: number;
  position?: "bottom-left" | "bottom-right" | "top-left" | "top-right";
}

const CORNER_RADIUSES: Record<ChipProps["position"], BorderRadiuses> = {
  "bottom-left": { bottom: 0, left: 0, topRight: "inherit" },
  "bottom-right": { bottom: 0, right: 0, topLeft: "inherit" },
  "top-left": { bottomRight: "inherit", left: 0, top: 0 },
  "top-right": { bottomLeft: "inherit", right: 0, top: 0 },
};

/** Bottom chips raised above a footer meet only the card's side, rounding both inner corners. */
const SIDE_RADIUSES: Partial<Record<ChipProps["position"], BorderRadiuses>> = {
  "bottom-left": { left: 0, right: "inherit" },
  "bottom-right": { left: "inherit", right: 0 },
};

export const Chip = ({
  bgColor = colors.background,
  corner = false,
  flush = false,
  footerOffset,
  hasFooter,
  opacity = 0.6,
  position,
  ...props
}: ChipProps) => {
  const isCorner = corner && !!position;
  const isRaised = position?.startsWith("bottom") && (!!footerOffset || hasFooter);

  const { css } = useClasses({
    flush: flush || isCorner,
    footerOffset,
    hasFooter,
    opacity,
    position,
  });

  return (
    <ChipBase
      radiuses={
        !isCorner ? undefined : isRaised ? SIDE_RADIUSES[position] : CORNER_RADIUSES[position]
      }
      {...props}
      {...{ bgColor }}
      className={css.chip}
    />
  );
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
