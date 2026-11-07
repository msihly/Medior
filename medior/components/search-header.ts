import type { CardProps } from "medior/components";

/**
 * Search card headers are as tall as their 40px icon buttons. The side padding matches the space
 * those leave above and below the shorter Filter Results button.
 */
export const SEARCH_HEADER_PROPS: CardProps["headerProps"] = {
  flex: "none",
  padding: { all: "0 0.45rem" },
};
