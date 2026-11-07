import { MouseEvent } from "react";
import { Comp, ContextMenuProps, getRatingMeta, ListItem } from "medior/components";
import { useStores } from "medior/store";
import { RatingDisplay } from "medior/utils/common";
import type { RatingButtonProps } from "./rating-button";

/** The ratings a rating menu offers, highest first. */
export const RATING_VALUES = [9, 8, 7, 6, 5, 4, 3, 2, 1, 0];

/** A context menu's rating options, shown like a rating menu's options. */
export const getRatingMenuItems = (
  display: RatingDisplay,
  setRating: (rating: number) => void,
): ContextMenuProps["menuItems"][number]["subItems"] =>
  RATING_VALUES.map((rating) => {
    const meta = getRatingMeta(rating, display);

    return {
      color: meta.textColor ?? meta.iconColor,
      icon: meta.icon ?? "Star",
      iconProps: { color: meta.iconColor },
      label: meta.text,
      onClick: () => setRating(rating),
    };
  });

export interface OptionRowProps {
  onClose: () => void;
  setRating: RatingButtonProps["setRating"];
  value: number;
}

export const OptionRow = Comp((props: OptionRowProps) => {
  const stores = useStores();

  const meta = getRatingMeta(props.value, stores.home.settings.file.ratingDisplay);

  const handleClick = (event: MouseEvent) => {
    event.stopPropagation();
    props.setRating(props.value);
    props.onClose();
  };

  return (
    <ListItem
      text={meta.text}
      onClick={handleClick}
      icon={meta.icon}
      iconProps={{ color: meta.iconColor }}
      color={meta.textColor ?? meta.iconColor}
    />
  );
});
