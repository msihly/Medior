import { useMemo } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import {
  Icon,
  InputWrapper,
  InputWrapperProps,
  Tag,
  TagInput,
  TagInputProps,
  Text,
  TooltipWrapper,
  View,
} from "components";
import { colors, makeClasses, useDeepMemo } from "utils";

interface RelationsProps extends Omit<TagInputProps, "label" | "onChange" | "ref"> {
  ancestryTagIds?: string[];
  ancestryType?: "ancestors" | "descendants";
  label: string;
  setValue: TagInputProps["onChange"];
  wrapperProps?: Partial<InputWrapperProps>;
}

export const Relations = observer(
  ({
    ancestryTagIds,
    ancestryType,
    label,
    options,
    setValue,
    value,
    wrapperProps = {},
    ...tagInputProps
  }: RelationsProps) => {
    const { css } = useClasses(null);

    const stores = useStores();

    const ancestryLabel = ancestryType === "ancestors" ? "Ancestors" : "Descendants";

    const valueMemo = useDeepMemo(value);

    const [oldAncestryTags, newAncestryTags] = useMemo(() => {
      if (!ancestryType || !ancestryTagIds) return [];

      const oldTags = ancestryTagIds
        .map((tagId) => stores.tag.getById(tagId))
        .sort((a, b) => b.count - a.count);

      const newTags = [
        ...new Set(
          value.flatMap((tagOpt) => {
            const tag = stores.tag.getById(tagOpt.id);
            return [
              tag,
              ...(ancestryType === "ancestors"
                ? stores.tag.getParentTags(tag, true)
                : stores.tag.getChildTags(tag, true)),
            ];
          })
        ),
      ].sort((a, b) => b.count - a.count);

      return [oldTags, newTags];
    }, [ancestryTagIds, ancestryType, valueMemo]);

    return (
      <InputWrapper
        {...{ label }}
        {...wrapperProps}
        labelSuffix={
          ancestryType &&
          ancestryTagIds && (
            <TooltipWrapper
              tooltip={
                <View column spacing="0.5rem">
                  <View column align="center">
                    <Text>{`Current Tag ${ancestryLabel}`}</Text>
                    <View className={css.tagRow}>
                      {oldAncestryTags.map((tag) => (
                        <Tag key={tag.id} tag={tag} hasEditor className={css.tag} />
                      ))}
                    </View>
                  </View>

                  <View column align="center">
                    <Text>{`New Tag ${ancestryLabel}`}</Text>
                    <View className={css.tagRow}>
                      {newAncestryTags.map((tag) => (
                        <Tag key={tag.id} tag={tag} hasEditor className={css.tag} />
                      ))}
                    </View>
                  </View>
                </View>
              }
            >
              <Icon
                name="InfoOutlined"
                color={colors.grey["600"]}
                size="1em"
                margins={{ left: "0.3rem" }}
              />
            </TooltipWrapper>
          )
        }
      >
        <TagInput
          {...{ options, value }}
          onChange={setValue}
          hasCreate
          hasDelete
          hasHelper
          limitTags={20}
          {...tagInputProps}
        />
      </InputWrapper>
    );
  }
);

const useClasses = makeClasses({
  tag: {
    margin: "0 0.3rem 0.3rem 0",
  },
  tagRow: {
    display: "flex",
    flexFlow: "row wrap",
    justifyContent: "center",
    overflow: "auto",
  },
});
