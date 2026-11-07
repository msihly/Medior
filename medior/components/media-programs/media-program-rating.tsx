import {
  Button,
  Comp,
  getRatingMeta,
  MEDIA_PROGRAM_BUTTON_PROPS,
  MenuButton,
} from "medior/components";
import { OptionRow, RATING_VALUES } from "medior/components/buttons/rating-option-row";
import { useStores } from "medior/store";
import { getContrastText } from "medior/utils/client";

export interface MediaProgramRatingProps {
  rating: number;
  setRating: (rating: number) => void;
}

/** A rating as the rating display settings show it, filling the button with its level's color. */
export const MediaProgramRating = Comp(({ rating, setRating }: MediaProgramRatingProps) => {
  const stores = useStores();

  const meta = getRatingMeta(rating, stores.home.settings.file.ratingDisplay);

  return (
    <MenuButton
      menuWidth="5rem"
      button={(onOpen) => (
        <Button
          {...MEDIA_PROGRAM_BUTTON_PROPS}
          text={rating > 0 ? meta.text : "Rate"}
          color={meta.chipBgColor}
          textColor={meta.chipBgColor ? getContrastText(meta.chipBgColor) : meta.chipColor}
          icon={meta.icon}
          iconProps={{ color: meta.iconColor }}
          onClick={onOpen}
        />
      )}
    >
      {(onClose) =>
        RATING_VALUES.map((value) => (
          <OptionRow key={value} onClose={onClose} value={value} setRating={setRating} />
        ))
      }
    </MenuButton>
  );
});
