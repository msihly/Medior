import { Avatar, Chip, ChipProps, colors } from "@mui/material";
import Color from "color";
import { observer } from "mobx-react-lite";
import { Tag as TagType, useStores } from "store";
import { makeClasses } from "utils";

export interface TagProps extends Omit<ChipProps, "color"> {
  color?: string;
  id?: string;
  tag?: TagType;
}

export const Tag = observer(
  ({ className, color = colors.blue["700"], id, size = "medium", tag, ...props }: TagProps) => {
    const { tagStore } = useStores();
    if (!tag) tag = tagStore.getById(id);

    const { css, cx } = useClasses({ color, size });

    return (
      <Chip
        avatar={<Avatar className={css.count}>{formatter.format(tag.count)}</Avatar>}
        label={tag.label}
        className={cx(css.chip, className)}
        size={size}
        {...props}
      />
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
      marginLeft: 2,
      width: size === "medium" ? 28 : 21,
      height: size === "medium" ? 28 : 21,
      fontSize: "0.75em",
    },
  },
}));
