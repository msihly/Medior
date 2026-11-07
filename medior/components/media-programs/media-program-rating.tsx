import { Comp, getRatingMeta, MediaProgramPill, MenuButton } from "medior/components";
import { OptionRow, RATING_VALUES } from "medior/components/buttons/rating-option-row";
import { useStores } from "medior/store";

export interface MediaProgramRatingProps {
  rating: number;
  setRating: (rating: number) => void;
}

/** A rating as the rating display settings show it, in the media program views' pill. */
export const MediaProgramRating = Comp(({ rating, setRating }: MediaProgramRatingProps) => {
  const stores = useStores();

  const meta = getRatingMeta(rating, stores.home.settings.file.ratingDisplay);

  return (
    <MenuButton
      menuWidth="5rem"
      button={(onOpen) => (
        <MediaProgramPill
          label={rating > 0 ? meta.text : "Rate"}
          bgColor={meta.chipBgColor}
          color={meta.chipColor}
          icon={meta.icon}
          iconColor={meta.iconColor}
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
