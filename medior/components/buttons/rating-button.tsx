import { Comp, FileBase, MenuButton } from "medior/components";
import { OptionRow, RATING_VALUES } from "./rating-option-row";

export interface RatingButtonProps {
  button?: boolean;
  disabled?: boolean;
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
          disabled={props.disabled}
          rating={props.rating}
          onClick={props.disabled ? undefined : onOpen}
          height="1.5em"
          noHide
        />
      )}
    >
      {(onClose) =>
        RATING_VALUES.map((value) => (
          <OptionRow key={value} onClose={onClose} value={value} setRating={props.setRating} />
        ))
      }
    </MenuButton>
  );
});
