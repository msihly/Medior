import { useMemo } from "react";
import { Card, Comp, Dropdown, Input, TagChip, TagToUpsert, Text, View } from "medior/components";
import { TagEditorStore, TagRegExTermSetting } from "medior/store";
import { colors } from "medior/utils/client";

const OVERLAP_CHIP_LIMIT = 30;

const TERM_MODE_OPTIONS: { label: string; value: TagRegExTermSetting }[] = [
  { label: "Off", value: "off" },
  { label: "Exact", value: "exact" },
  { label: "Whole Word", value: "word" },
  { label: "Partial", value: "partial" },
];

export interface RegExMapCardProps {
  disabled?: boolean;
  onTagClick?: (tag: TagToUpsert) => void;
  store: TagEditorStore;
}

export const RegExMapCard = Comp(({ disabled = false, onTagClick, store }: RegExMapCardProps) => {
  const termModes = new Set(store.regExTerms.map(({ mode }) => mode));

  const isTestStringValid = useMemo(() => {
    try {
      return (
        !store.regExTestString.length ||
        new RegExp(store.regExValue, "im").test(store.regExTestString)
      );
    } catch (error) {
      return false;
    }
  }, [store.regExValue, store.regExTestString]);

  return (
    <Card column header="Regular Expression" spacing="0.5rem">
      <View row spacing="0.5rem">
        <View column flex={1} spacing="0.3rem" maxHeight="12rem" overflow="hidden auto">
          <Dropdown
            header="All Terms"
            options={TERM_MODE_OPTIONS}
            value={termModes.size === 1 ? [...termModes][0] : null}
            setValue={store.setAllRegExTermModes}
            disabled={disabled || !store.regExTerms.length}
            dense
          />

          {store.regExTerms.map((term) => (
            <View key={term.key} row align="center" spacing="0.5rem">
              <View flex={1} overflow="hidden">
                <Text tooltip={term.term}>{term.term}</Text>
              </View>

              <Dropdown
                options={TERM_MODE_OPTIONS}
                value={term.mode}
                setValue={(mode) => store.setRegExTermMode(term.key, mode)}
                disabled={disabled}
                width="9rem"
                dense
              />
            </View>
          ))}
        </View>

        <View column flex={1} spacing="0.5rem">
          <Input
            header="Custom Pattern"
            placeholder="Enter RegEx..."
            value={store.regExCustom}
            setValue={store.setRegExCustom}
            disabled={disabled}
            error={!store.isRegExValid}
            width="100%"
            InputProps={{
              endAdornment: (
                <View flex="none" margins={{ left: "0.5rem" }}>
                  <Text>{"/"}</Text>
                </View>
              ),
              startAdornment: (
                <View flex="none" margins={{ right: "0.5rem" }}>
                  <Text>{"/"}</Text>
                </View>
              ),
            }}
          />

          <Input
            header="Test String"
            placeholder="Enter test string..."
            value={store.regExTestString}
            setValue={store.setRegExTestString}
            disabled={disabled}
            error={!isTestStringValid}
            hasHelper
            helperText={!isTestStringValid ? "Does not match RegExp" : null}
            multiline
            rows={2}
            width="100%"
          />
        </View>
      </View>

      {store.regExOverlaps?.matchedTotal > 0 && (
        <RegExOverlapRow
          label="Matches the labels or aliases of"
          onTagClick={onTagClick}
          tags={store.regExOverlaps.matched}
          total={store.regExOverlaps.matchedTotal}
        />
      )}

      {store.regExOverlaps?.matchedByTotal > 0 && (
        <RegExOverlapRow
          label="Label or aliases matched by the RegEx of"
          onTagClick={onTagClick}
          tags={store.regExOverlaps.matchedBy}
          total={store.regExOverlaps.matchedByTotal}
        />
      )}
    </Card>
  );
});

interface RegExOverlapRowProps {
  label: string;
  onTagClick?: (tag: TagToUpsert) => void;
  tags: { id: string; label: string; term: string }[];
  total: number;
}

const RegExOverlapRow = ({ label, onTagClick, tags, total }: RegExOverlapRowProps) => (
  <View column spacing="0.3rem">
    <Text color={colors.custom.orange}>{`${label} ${total} other tags`}</Text>

    <View row wrap="wrap" spacing="0.3rem">
      {tags.slice(0, OVERLAP_CHIP_LIMIT).map((tag) => (
        <TagChip
          key={tag.id}
          tag={{ id: tag.id, label: tag.label }}
          onClick={onTagClick ? () => onTagClick(tag) : null}
        />
      ))}

      {total > OVERLAP_CHIP_LIMIT && (
        <Text color={colors.custom.lightGrey}>{`+${total - OVERLAP_CHIP_LIMIT} more`}</Text>
      )}
    </View>
  </View>
);
