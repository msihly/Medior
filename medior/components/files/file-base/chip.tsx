import { Chip as ChipBase, ChipProps as ChipBaseProps, Comp } from "medior/components";
import { useStores } from "medior/store";
import { BorderRadiuses, Borders, CSS, makeBorders, makeClasses } from "medior/utils/client";

export interface ChipProps extends ChipBaseProps {
  flush?: boolean;
  footerOffset?: CSS["bottom"];
  hasFooter?: boolean;
  position?: "bottom-left" | "bottom-right" | "top-left" | "top-right";
}

/** The flush sides of a chip against the card's edges, which drop their rounding and outline. */
interface FlushEdges {
  borders: Borders;
  radiuses: BorderRadiuses;
}

const CORNER_EDGES: Record<ChipProps["position"], FlushEdges> = {
  "bottom-left": {
    borders: { bottom: "none", left: "none" },
    radiuses: { bottom: 0, left: 0, topRight: "inherit" },
  },
  "bottom-right": {
    borders: { bottom: "none", right: "none" },
    radiuses: { bottom: 0, right: 0, topLeft: "inherit" },
  },
  "top-left": {
    borders: { left: "none", top: "none" },
    radiuses: { bottomRight: "inherit", left: 0, top: 0 },
  },
  "top-right": {
    borders: { right: "none", top: "none" },
    radiuses: { bottomLeft: "inherit", right: 0, top: 0 },
  },
};

/** Bottom chips raised above a footer meet only the card's side, rounding both inner corners. */
const SIDE_EDGES: Partial<Record<ChipProps["position"], FlushEdges>> = {
  "bottom-left": { borders: { left: "none" }, radiuses: { left: 0, right: "inherit" } },
  "bottom-right": { borders: { right: "none" }, radiuses: { left: "inherit", right: 0 } },
};

/**
 * A chip on a card. With the Corner shape setting, it sits flush against the card's corner, rounding
 * only the corner facing into the card.
 */
export const Chip = Comp(
  ({ flush = false, footerOffset, hasFooter, position, ...props }: ChipProps) => {
    const stores = useStores();

    const isCorner = stores.home.settings.file.ratingDisplay.shape === "corner" && !!position;
    const isRaised = position?.startsWith("bottom") && (!!footerOffset || hasFooter);
    const edges = !isCorner ? undefined : isRaised ? SIDE_EDGES[position] : CORNER_EDGES[position];

    const { css } = useClasses({
      flush: flush || isCorner,
      flushBorders: edges?.borders,
      footerOffset,
      hasFooter,
      position,
    });

    return <ChipBase overMedia radiuses={edges?.radiuses} {...props} className={css.chip} />;
  },
);

interface ClassesProps extends Pick<
  ChipProps,
  "flush" | "footerOffset" | "hasFooter" | "position"
> {
  flushBorders?: Borders;
}

const useClasses = makeClasses((props: ClassesProps) => ({
  chip: {
    ...makeBorders(props.flushBorders),
    // Flush chips outline their inner sides as thinly as the card's own border.
    borderWidth: props.flushBorders ? 1 : undefined,
    bottom: props.position?.includes("bottom")
      ? (props.footerOffset ?? (props.hasFooter ? "2rem" : props.flush ? 0 : "0.3rem"))
      : undefined,
    cursor: "pointer",
    left: props.position?.includes("left") ? (props.flush ? 0 : "0.3rem") : undefined,
    position: props.position ? "absolute" : undefined,
    right: props.position?.includes("right") ? (props.flush ? 0 : "0.3rem") : undefined,
    top: props.position?.includes("top") ? (props.flush ? 0 : "0.3rem") : undefined,
  },
}));
