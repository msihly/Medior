import { ReactNode } from "react";
import {
  Button,
  Comp,
  Icon,
  IconName,
  ListItem,
  MenuButton,
  MultiInputRow,
  MultiInputRowProps,
  View,
} from "medior/components";
import { SearchTagType, TagOption, useStores } from "medior/store";
import { colors, CssColor } from "medior/utils/client";

const TAG_SEARCH_META: {
  [key in SearchTagType]: { color: CssColor; icon: IconName; text: string };
} = {
  exclude: {
    color: colors.custom.red,
    icon: "RemoveCircleOutline",
    text: "Exclude",
  },
  excludeDesc: {
    color: colors.custom.red,
    icon: "RemoveCircle",
    text: "Exclude (Descendants)",
  },
  includeAnd: {
    color: colors.custom.green,
    icon: "AddCircle",
    text: "Include (Required)",
  },
  includeOr: {
    color: colors.custom.green,
    icon: "AddCircleOutline",
    text: "Include (Optional)",
  },
  includeDesc: {
    color: colors.custom.green,
    icon: "ControlPointDuplicate",
    text: "Include (Descendants)",
  },
};

export interface TagInputRowProps extends Omit<MultiInputRowProps<TagOption>, "value"> {
  hasEditor?: boolean;
  hasSearchMenu?: boolean;
  rightNode?: (tag: TagOption) => ReactNode;
  tag: TagOption;
}

export const TagInputRow = Comp(
  ({
    hasDelete,
    hasEditor,
    hasSearchMenu,
    onClick,
    rightNode,
    search,
    style,
    tag,
  }: TagInputRowProps) => {
    const stores = useStores();
    const store = stores.tag;

    const category = store.getCategory(tag);
    const hasClick = hasEditor || !!onClick;
    const searchType = hasSearchMenu
      ? search.value.find((t) => t.id === tag?.id)?.searchType
      : null;

    const searchMeta = hasSearchMenu ? TAG_SEARCH_META[searchType] : null;

    const handleClick = () => {
      onClick?.(tag);

      if (hasEditor) {
        store.editor.setIsOpen(true);
        store.editor.loadTag({ id: tag.id });
      }
    };

    const handleMenuClick = (searchType: SearchTagType) =>
      search.onChange(search.value.map((t) => (t.id === tag.id ? { ...t, searchType } : t)));

    return (
      <MultiInputRow
        {...{ hasDelete, search, style }}
        bgColor={category?.color}
        value={tag}
        valueExtractor={(tag) => tag.label}
        onClick={hasClick ? handleClick : null}
        leftNode={
          !category?.icon ? null : (
            <Icon
              name={category.icon}
              onClick={hasClick ? handleClick : null}
              size="1em"
              margins={{ left: "0.3em", right: "-0.2em" }}
            />
          )
        }
        rightNode={
          rightNode?.(tag) ??
          (hasSearchMenu && (
            <MenuButton
              anchorOrigin={{ horizontal: "left", vertical: "top" }}
              transformOrigin={{ horizontal: "left", vertical: "top" }}
              button={(onOpen) => (
                <Button
                  onClick={onOpen}
                  icon={searchMeta?.icon}
                  iconProps={{ color: searchMeta?.color }}
                  color={colors.foreground}
                  padding={{ all: "0.3em" }}
                  boxShadow="none"
                />
              )}
            >
              <View onClick={(event) => event.stopPropagation()}>
                {Object.entries(TAG_SEARCH_META).map(([type, { color, icon, text }]) => (
                  <ListItem
                    key={text}
                    {...{ icon, text }}
                    iconProps={{ color }}
                    onClick={() => handleMenuClick(type as SearchTagType)}
                  />
                ))}
              </View>
            </MenuButton>
          ))
        }
      />
    );
  },
);
