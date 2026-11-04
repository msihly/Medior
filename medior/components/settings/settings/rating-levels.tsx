import { Text, View } from "medior/components";
import { makeClasses } from "medior/utils/client";
import { RatingLevelInput } from "./rating-level-input";

const COLUMNS = ["Rating", "Text", "Icon", "Icon Color", "Text Color", "Glow", "Preview"];

const RATINGS = [9, 8, 7, 6, 5, 4, 3, 2, 1, 0];

export const RatingLevels = () => {
  const { css } = useClasses(null);

  return (
    <View column spacing="0.5rem">
      <View className={css.grid}>
        {COLUMNS.map((column) => (
          <Text key={column} preset="sub-text">
            {column}
          </Text>
        ))}

        {RATINGS.map((rating) => (
          <RatingLevelInput key={rating} rating={rating} />
        ))}
      </View>

      <Text preset="sub-text" fontSize="0.8em" whiteSpace="normal">
        {"{rating} in a text shows the rating itself. Empty text colors use the surrounding color."}
      </Text>
    </View>
  );
};

const useClasses = makeClasses({
  grid: {
    display: "grid",
    gridTemplateColumns: `repeat(${COLUMNS.length}, max-content)`,
    alignItems: "center",
    justifyItems: "start",
    gap: "0.5rem 1rem",
  },
});
