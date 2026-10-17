import {
  Card,
  Checkbox,
  Comp,
  Dropdown,
  FileFilter,
  NumInput,
  Slider,
  Text,
  View,
} from "medior/components";
import { useStores } from "medior/store";
import { colors } from "medior/utils/client";
import {
  MAX_DUPLICATE_TIME_WINDOW,
  MAX_VARIATION_THRESHOLD,
  MIN_DUPLICATE_SIMILARITY,
  MIN_VARIATION_THRESHOLD,
} from "medior/utils/common/duplicate-search";

/** Block sizes that differ meaningfully at the 256-pixel width thumbnails are compared at. */
const BLOCK_SIZE_OPTIONS = [8, 12, 16, 24, 32, 48, 64].map((size) => ({
  label: `${size} px`,
  value: String(size),
}));

export const SearchSettings = Comp(() => {
  const stores = useStores();
  const store = stores.file.lowerResolution;

  return (
    <>
      <Card header="Files" flex="1 0 auto" justify="center" maxWidth="fit-content">
        <FileFilter.Menu
          store={store.search}
          color={colors.foregroundCard}
          onSearch={store.applyMenuFilter}
          hideArchivedAndCorrupted
        />
      </Card>

      <Card header="Similarity" flex="none" justify="center" width="10rem">
        <View row justify="flex-end">
          <Text bold color={colors.custom.lightBlue}>{`${store.minSimilarity.toFixed(1)}%`}</Text>
        </View>

        <Slider
          value={store.minSimilarity}
          setValue={store.setMinSimilarity}
          min={MIN_DUPLICATE_SIMILARITY}
          max={100}
          step={0.1}
          disabled={store.isArchiving}
        />
      </Card>

      <Card
        header="Variations"
        row
        align="center"
        flex="1 0 auto"
        maxWidth="fit-content"
        spacing="0.3rem"
      >
        <Dropdown
          header="Block"
          labelTextProps={{
            tooltip:
              "Size of the areas changes are measured in. Smaller areas catch smaller edits, such as a hat.",
          }}
          options={BLOCK_SIZE_OPTIONS}
          value={String(store.variationBlockSize)}
          setValue={(value) => store.setVariationBlockSize(Number(value))}
          disabled={store.isArchiving}
          width="6.5rem"
          dense
        />

        <NumInput
          header="Threshold"
          labelTextProps={{
            tooltip:
              "How far an area's brightness must change, out of 255, to mark a variation. Lower values catch subtler edits.",
          }}
          value={store.variationThreshold}
          setValue={store.setVariationThreshold}
          minValue={MIN_VARIATION_THRESHOLD}
          maxValue={MAX_VARIATION_THRESHOLD}
          disabled={store.isArchiving}
          width="4.5rem"
          dense
        />
      </Card>

      <Card
        header="Date Created"
        row
        align="center"
        flex="1 0 auto"
        maxWidth="fit-content"
        spacing="0.3rem"
      >
        <Checkbox
          label="Group within"
          checked={store.isTimeGrouped}
          setChecked={store.setIsTimeGrouped}
          disabled={store.isArchiving}
          flex="none"
          width="auto"
        />

        <NumInput
          placeholder="Window"
          adornment="min"
          adornmentColor={colors.custom.lightGrey}
          value={store.timeWindowMinutes}
          setValue={store.setTimeWindowMinutes}
          minValue={1}
          maxValue={MAX_DUPLICATE_TIME_WINDOW}
          disabled={store.isArchiving}
          width="6rem"
          dense
        />
      </Card>
    </>
  );
});
