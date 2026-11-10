import type { CardProps } from "medior/components";

/**
 * Search card headers are as tall as 40px icon buttons, even without any, so every view's header
 * lines up. The side padding matches the space those leave above and below the shorter Filter
 * button.
 */
export const SEARCH_HEADER_PROPS: CardProps["headerProps"] = {
  flex: "none",
  minHeight: 40,
  padding: { all: "0 0.45rem" },
};
