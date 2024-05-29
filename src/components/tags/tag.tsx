import { ReactNode, useState } from "react";
import { Tag as TagType, observer, useStores } from "store";
import { Avatar, Menu } from "@mui/material";
import { Button, ButtonProps, Chip, ChipProps, Text, View } from "components";
import { colors, makeClasses } from "utils";
import Color from "color";

const HEIGHT_MEDIUM = 32;
const HEIGHT_SMALL = 26;

export interface TagProps extends Omit<ChipProps, "color" | "label" | "onClick"> {
  color?: string;
  hasEditor?: boolean;
  id?: string;
  menu?: ReactNode;
  menuButtonProps?: Partial<ButtonProps>;
  onClick?: (id: string) => void;
  tag?: TagType;
}

export const Tag = observer(
  ({
    className,
    color = colors.blue["700"],
    hasEditor = false,
    id,
    menu,
    menuButtonProps = {},
    onClick,
    onDelete = null,
    size = "small",
    tag,
    ...props
  }: TagProps) => {
    const { css, cx } = useClasses({ color, size });

    const stores = useStores();
    if (!tag) tag = stores.tag.getById(id);

    const [anchorEl, setAnchorEl] = useState(null);

    const handleClick = () => {
      onClick?.(tag?.id);
      if (hasEditor) {
        stores.tag.setActiveTagId(tag?.id);
        stores.tag.setIsTagEditorOpen(true);
      }
    };

    const handleClose = () => setAnchorEl(null);

    const handleOpen = (event) => {
      event.stopPropagation();
      setAnchorEl(event.currentTarget);
    };

    return (
      <>
        <Chip
          {...props}
          {...{ onDelete }}
          onClick={hasEditor || onClick ? handleClick : null}
          avatar={
            <Avatar className={css.count}>
              {tag?.count !== undefined ? formatter.format(tag.count) : "-"}
            </Avatar>
          }
          label={
            <View row align="center">
              <Text tooltip={tag?.label} tooltipProps={{ flexShrink: 1 }} className={css.label}>
                {tag?.label}
              </Text>

              {menu && (
                <Button
                  circle
                  color={colors.grey["700"]}
                  icon="MoreVert"
                  padding={{ all: "0.25em" }}
                  onClick={handleOpen}
                  margins={{ left: "0.3em", right: "-0.4rem" }}
                  iconSize="1.6em"
                  {...menuButtonProps}
                />
              )}
            </View>
          }
          size={size}
          className={cx(css.chip, className)}
        />

        <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleClose} keepMounted>
          <View>{menu}</View>
        </Menu>
      </>
    );
  }
);

const formatter = Intl.NumberFormat("en", { notation: "compact" });

const useClasses = makeClasses((_, { color, size }) => ({
  chip: {
    marginRight: "0.2em",
    padding: "0.3em 0",
    height: size === "medium" ? HEIGHT_MEDIUM : HEIGHT_SMALL,
  },
  count: {
    background: `linear-gradient(to bottom right, ${color}, ${Color(color).darken(0.3).string()})`,
    "&.MuiChip-avatar": {
      borderRadius: "50% 0 0 50%",
      marginLeft: 0,
      width: size === "medium" ? HEIGHT_MEDIUM : HEIGHT_SMALL,
      height: size === "medium" ? HEIGHT_MEDIUM : HEIGHT_SMALL,
      fontSize: "0.7em",
    },
  },
  label: {
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
}));
