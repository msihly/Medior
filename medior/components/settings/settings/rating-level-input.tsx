import {
  ColorPicker,
  Comp,
  FileBase,
  IconName,
  IconPicker,
  Input,
  NumInput,
  Text,
} from "medior/components";
import { useStores } from "medior/store";
import { colors, CssColor } from "medior/utils/client";

export interface RatingLevelInputProps {
  rating: number;
}

/** One rating's cells in the rating levels grid. */
export const RatingLevelInput = Comp(({ rating }: RatingLevelInputProps) => {
  const stores = useStores();
  const store = stores.home.settings;

  const level = store.file.ratingDisplay.levels[rating];

  const setGlow = (glow: number) => store.setRatingLevel(rating, { glow: glow ?? 0 });

  const setIcon = (icon: IconName | null) => store.setRatingLevel(rating, { icon });

  const setIconColor = (iconColor: CssColor | null) => store.setRatingLevel(rating, { iconColor });

  const setText = (text: string) => store.setRatingLevel(rating, { text });

  const setTextColor = (textColor: CssColor | null) => store.setRatingLevel(rating, { textColor });

  return (
    <>
      <Text textAlign="center" width="100%">
        {rating === 0 ? "Unrated" : rating}
      </Text>

      <Input value={level.text} setValue={setText} textAlign="center" width="7rem" dense />

      <IconPicker value={level.icon} setValue={setIcon} width="5rem" dense />

      <ColorPicker
        swatches={colors.swatches}
        value={level.iconColor}
        setValue={setIconColor}
        width="5rem"
        noIcon
        dense
      />

      <ColorPicker
        swatches={colors.swatches}
        value={level.textColor}
        setValue={setTextColor}
        width="5rem"
        noIcon
        dense
      />

      <NumInput
        value={level.glow}
        setValue={setGlow}
        minValue={0}
        textAlign="center"
        width="6rem"
        dense
      />

      <FileBase.RatingChip rating={rating} noHide />
    </>
  );
});
