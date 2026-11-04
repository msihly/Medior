import { MouseEvent } from "react";
import { Comp, getRatingMeta, ListItem } from "medior/components";
import { useStores } from "medior/store";
import type { RatingButtonProps } from "./rating-button";

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
