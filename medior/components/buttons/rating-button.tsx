import { MouseEvent } from "react";
import { Comp, FileBase, getRatingMeta, ListItem, MenuButton } from "medior/components";

export interface RatingButtonProps {
  button?: boolean;
  rating: number;
  setRating: (rating: number) => void;
}

export const RatingButton = Comp((props: RatingButtonProps) => {
  return (
    <MenuButton
      menuWidth="5rem"
      button={(onOpen) => (
        <FileBase.RatingChip
          button={props.button}
          rating={props.rating}
          onClick={onOpen}
          height="1.5em"
          noHide
        />
      )}
    >
      {[9, 8, 7, 6, 5, 4, 3, 2, 1, 0].map((value) => (
        <OptionRow key={value} value={value} setRating={props.setRating} />
      ))}
    </MenuButton>
  );
});

interface OptionRowProps {
  setRating: RatingButtonProps["setRating"];
  value: number;
}

const OptionRow = Comp((props: OptionRowProps) => {
  const meta = getRatingMeta(props.value);

  const handleClick = (event: MouseEvent) => {
    event.stopPropagation();
    props.setRating(props.value);
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
