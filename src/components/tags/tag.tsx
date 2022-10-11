import { Avatar, Chip, ChipProps, colors } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { makeClasses } from "utils";

interface TagProps extends ChipProps {
  id: string;
}

export const Tag = observer(({ className, id, size = "medium", ...props }: TagProps) => {
  const { classes: css, cx } = useClasses({ size });
  const { tagStore } = useStores();

  const tag = tagStore.getById(id);

  return (
    <Chip
      avatar={<Avatar className={css.count}>{formatter.format(tag.count)}</Avatar>}
      label={tag.label}
      className={cx(css.chip, className)}
      size={size}
      {...props}
    />
  );
});

const formatter = Intl.NumberFormat("en", { notation: "compact" });

const useClasses = makeClasses((_, { size }) => ({
  chip: {
    marginRight: "0.2em",
  },
  count: {
    backgroundColor: colors.blue["800"],
    "&.MuiChip-avatar": {
      marginLeft: 2,
      width: size === "medium" ? 28 : 21,
      height: size === "medium" ? 28 : 21,
      fontSize: "0.75em",
    },
  },
}));
