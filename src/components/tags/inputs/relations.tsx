import { useMemo } from "react";
import { observer, useStores } from "store";
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
import { colors, makeClasses } from "utils";

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

    const ancestryTags = useMemo(() => {
      if (!ancestryType || !ancestryTagIds) return [];

      return stores.tag.listByIds(ancestryTagIds).sort((a, b) => b.count - a.count);
    }, [ancestryTagIds, ancestryType]);

    return (
      <InputWrapper
        {...{ label }}
        {...wrapperProps}
        labelSuffix={
          ancestryType &&
          ancestryTagIds && (
            <TooltipWrapper
              tooltip={
                <View column align="center">
                  <Text>{`Current Tag ${ancestryLabel}`}</Text>
                  <View className={css.tagRow}>
                    {ancestryTags.map((tag) => (
                      <Tag key={tag?.id} tag={tag} hasEditor className={css.tag} />
                    ))}
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
    maxHeight: "10rem",
    overflow: "auto",
  },
});
