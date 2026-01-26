import { MouseEvent } from "react";
import { Comp, IconName, ListItem, MenuButton } from "medior/components";
import { RatingChip } from "medior/components/files/file-base/rating-chip";

export interface RatingButtonProps {
  rating: number;
  setRating: (rating: number) => void;
}

export const RatingButton = Comp((props: RatingButtonProps) => {
  return (
    <MenuButton
      menuWidth="5rem"
      button={(onOpen) => (
        <RatingChip onClick={onOpen} rating={props.rating} height="1.5em" noHide />
      )}
    >
      <OptionRow value={0} setRating={props.setRating} />
      <OptionRow value={1} setRating={props.setRating} />
      <OptionRow value={2} setRating={props.setRating} />
      <OptionRow value={3} setRating={props.setRating} />
      <OptionRow value={4} setRating={props.setRating} />
      <OptionRow value={5} setRating={props.setRating} />
      <OptionRow value={6} setRating={props.setRating} />
      <OptionRow value={7} setRating={props.setRating} />
      <OptionRow value={8} setRating={props.setRating} />
      <OptionRow value={9} setRating={props.setRating} />
    </MenuButton>
  );
});

interface OptionRowProps {
  icon?: IconName;
  setRating: RatingButtonProps["setRating"];
  value: number;
}

const OptionRow = Comp(({ icon = "Star", ...props }: OptionRowProps) => {
  const handleClick = (event: MouseEvent) => {
    event.stopPropagation();
    props.setRating(props.value);
  };

  return <ListItem icon={icon} text={props.value} onClick={handleClick} />;
});
