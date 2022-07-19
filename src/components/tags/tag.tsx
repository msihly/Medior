import { Avatar, Chip, ChipProps, colors } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { makeClasses } from "utils";

interface TagProps extends ChipProps {
  id: string;
}

const Tag = observer(({ className, id, ...props }: TagProps) => {
  const { classes: css, cx } = useClasses(null);
  const { tagStore } = useStores();

  const tag = tagStore.getById(id);

  return (
    <Chip
      avatar={<Avatar className={css.count}>{tag.count}</Avatar>}
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
