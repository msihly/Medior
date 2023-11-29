import { ReactNode, useState } from "react";
import { observer } from "mobx-react-lite";
import { Tag as TagType, useStores } from "store";
import { Avatar, Chip, ChipProps, Menu } from "@mui/material";
import { Button, ButtonProps, Text, View } from "components";
import { colors, makeClasses } from "utils";
import Color from "color";

export interface TagProps extends Omit<ChipProps, "color"> {
  color?: string;
  id?: string;
  menu?: ReactNode;
  menuButtonProps?: Partial<ButtonProps>;
  tag?: TagType;
}

export const Tag = observer(
  ({
    className,
    color = colors.blue["700"],
    id,
    menu,
    menuButtonProps = {},
    size = "medium",
    tag,
    ...props
  }: TagProps) => {
    const { css, cx } = useClasses({ color, size });

    const { tagStore } = useStores();
    if (!tag) tag = tagStore.getById(id);

    const [anchorEl, setAnchorEl] = useState(null);

    const handleClose = () => setAnchorEl(null);

    const handleOpen = (event) => setAnchorEl(event.currentTarget);

    return (
      <>
        <Chip
          {...props}
          avatar={<Avatar className={css.count}>{formatter.format(tag?.count)}</Avatar>}
          label={
            <View row align="center">
              <Text tooltip={tag?.label} className={css.label}>
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
                  {...menuButtonProps}
                />
              )}
            </View>
          }
          size={size}
          className={cx(css.chip, className)}
          onDelete={null}
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
  },
  count: {
    background: `linear-gradient(to bottom right, ${color}, ${Color(color).darken(0.3).string()})`,
    "&.MuiChip-avatar": {
      marginLeft: "0.25em",
      width: size === "medium" ? 28 : 21,
      height: size === "medium" ? 28 : 21,
      fontSize: "0.75em",
    },
  },
  label: {
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
}));
