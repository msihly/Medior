import { Avatar, Chip, ChipProps, colors } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { makeClasses } from "utils";

interface TagProps extends ChipProps {
  count?: number;
  id: string;
}

const Tag = observer(({ className, count, id, ...props }: TagProps) => {
  const { classes: css, cx } = useClasses(null);
  const { fileStore, tagStore } = useStores();

  const tag = tagStore.getById(id);
  count ??= fileStore.getTagCountById(id);

  return (
    <Chip
      avatar={<Avatar className={css.count}>{count}</Avatar>}
      label={tag.label}
      className={cx(css.chip, className)}
      {...props}
    />
  );
});

export default Tag;

const useClasses = makeClasses({
  chip: {
    marginRight: "0.2em",
  },
  count: {
    backgroundColor: colors.blue["800"],
  },
});
