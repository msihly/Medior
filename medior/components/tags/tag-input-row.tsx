import { useState } from "react";
import { Menu } from "@mui/material";
import {
  Button,
  IconName,
  ListItem,
  MultiInputRow,
  MultiInputRowProps,
  Text,
  View,
} from "medior/components";
import { observer, SearchTagType, TagOption, useStores } from "medior/store";
import { colors, makeClasses } from "medior/utils/client";
import { abbrevNum, } from "medior/utils/common";

const TAG_SEARCH_META: {
  [key in SearchTagType]: { color: string; icon: IconName; text: string };
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
  tag: TagOption;
}

export const TagInputRow = observer(
  ({ hasDelete, hasEditor, hasSearchMenu, onClick, search, style, tag }: TagInputRowProps) => {
    const stores = useStores();

    const searchType = hasSearchMenu
      ? search.value.find((t) => t.id === tag?.id)?.searchType
      : null;
    const searchMeta = hasSearchMenu ? TAG_SEARCH_META[searchType] : null;

    const hasClick = hasEditor || !!onClick;
    const { css } = useClasses({ hasClick });

    const [anchorEl, setAnchorEl] = useState(null);

    const handleClick = () => {
      onClick?.(tag);
      if (hasEditor) {
        stores.tag.setActiveTagId(tag?.id);
        stores.tag.setIsTagEditorOpen(true);
      }
    };

    const handleClose = () => setAnchorEl(null);

    const handleMenuClick = (searchType: SearchTagType) =>
      search.onChange(search.value.map((t) => (t.id === tag.id ? { ...t, searchType } : t)));

    const handleOpen = (event) => {
      event.stopPropagation();
      setAnchorEl(event.currentTarget);
    };

    return (
      <>
        <MultiInputRow
          {...{ hasDelete, search, style }}
          value={tag}
          valueExtractor={(tag) => tag.label}
          onClick={hasClick ? handleClick : null}
          leftNode={
            <View onClick={hasClick ? handleClick : null} className={css.count}>
              <Text fontSize="0.5em">{tag?.count !== undefined ? abbrevNum(tag.count) : "-"}</Text>
            </View>
          }
          rightNode={
            hasSearchMenu && (
              <Button
                onClick={handleOpen}
                icon={searchMeta?.icon}
                iconProps={{ color: searchMeta?.color }}
                color="transparent"
                colorOnHover={colors.foregroundCard}
                padding={{ all: "0.3em" }}
                boxShadow="none"
              />
            )
          }
        />

        <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleClose} keepMounted>
          <View>
            {hasSearchMenu
              ? Object.entries(TAG_SEARCH_META).map(([type, { color, icon, text }]) => (
                  <ListItem
                    key={text}
                    {...{ icon, text }}
                    iconProps={{ color }}
                    onClick={() => handleMenuClick(type as SearchTagType)}
                  />
                ))
              : null}
          </View>
        </Menu>
      </>
    );
  }
);

const useClasses = makeClasses({
  count: {
    display: "flex",
    flexShrink: 0,
    justifyContent: "center",
    alignItems: "center",
    padding: "0.2em",
    height: "100%",
    width: "1.75rem",
    backgroundColor: colors.custom.blue,
  },
});
