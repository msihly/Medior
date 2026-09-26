import { MouseEvent } from "react";
import { Comp, getRatingMeta, ListItem } from "medior/components";
import type { RatingButtonProps } from "./rating-button";

export interface OptionRowProps {
  onClose: () => void;
  setRating: RatingButtonProps["setRating"];
  value: number;
}

export const OptionRow = Comp((props: OptionRowProps) => {
  const meta = getRatingMeta(props.value);

  const handleClick = (event: MouseEvent) => {
    event.stopPropagation();
    props.setRating(props.value);
    props.onClose();
  };

  return (
    <ListItem
      text={props.value}
      onClick={handleClick}
      icon={meta.icon}
      iconProps={{ color: meta.iconColor }}
      color={meta.iconColor}
    />
  );
});
