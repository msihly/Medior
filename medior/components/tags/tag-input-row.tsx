import { observer, SearchTagType, TagOption, useStores } from "medior/store";
import { Button, IconName, ListItem, Text, View } from "medior/components";
import { colors, makeClasses } from "medior/utils";
import { useState } from "react";
import { Menu } from "@mui/material";

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

export const TAG_INPUT_ROW_HEIGHT = 30;

export interface TagInputRowProps {
  hasDelete?: boolean;
  hasEditor?: boolean;
  hasSearchMenu?: boolean;
  onClick?: (id: string) => void;
  search: {
    onChange: (val: TagOption[]) => void;
    value: TagOption[];
  };
  style?: React.CSSProperties;
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
      onClick?.(tag?.id);
      if (hasEditor) {
        stores.tag.setActiveTagId(tag?.id);
        stores.tag.setIsTagEditorOpen(true);
      }
    };

    const handleClose = () => setAnchorEl(null);

    const handleDelete = () => search.onChange(search.value.filter((t) => t.id !== tag.id));

    const handleMenuClick = (searchType: SearchTagType) =>
      search.onChange(search.value.map((t) => (t.id === tag.id ? { ...t, searchType } : t)));

    const handleOpen = (event) => {
      event.stopPropagation();
      setAnchorEl(event.currentTarget);
    };

    return (
      <>
        <View row className={css.root} style={style}>
          <View onClick={hasClick ? handleClick : null} className={css.count}>
            <Text fontSize="0.5em">
              {tag.count !== undefined ? formatter.format(tag.count) : "-"}
            </Text>
          </View>

          <View onClick={hasClick ? handleClick : null} row flex={1} overflow="hidden">
            <Text tooltip={tag.label} tooltipProps={{ flexShrink: 1 }} className={css.label}>
              {tag.label}
            </Text>
          </View>

          {hasSearchMenu && (
            <Button
              onClick={handleOpen}
              icon={searchMeta?.icon}
              iconProps={{ color: searchMeta?.color }}
              color="transparent"
              colorOnHover={colors.foregroundCard}
              padding={{ all: "0.3em" }}
              boxShadow="none"
            />
          )}

          {hasDelete && (
            <Button
              onClick={handleDelete}
              icon="Close"
              color="transparent"
              colorOnHover={colors.custom.red}
              padding={{ all: "0.3em" }}
              boxShadow="none"
            />
          )}
        </View>

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

const formatter = Intl.NumberFormat("en", { notation: "compact" });

const useClasses = makeClasses((props: { hasClick: boolean }) => ({
  count: {
    display: "flex",
    flexShrink: 0,
    justifyContent: "center",
    alignItems: "center",
    padding: "0.2em",
    height: "100%",
    width: TAG_INPUT_ROW_HEIGHT,
    backgroundColor: colors.custom.blue,
  },
  label: {
    padding: "0 0.3rem",
    fontSize: "0.8em",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  root: {
    alignItems: "center",
    borderBottom: `1px solid ${colors.custom.black}`,
    height: TAG_INPUT_ROW_HEIGHT,
    width: "100%",
    backgroundColor: colors.foreground,
    cursor: props.hasClick ? "pointer" : undefined,
  },
}));
