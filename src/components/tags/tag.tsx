import { Avatar, Chip, ChipProps, colors } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { makeStyles } from "utils";

interface TagProps extends ChipProps {
  count: number;
  id: string;
}

const Tag = observer(({ count, id, ...props }: TagProps) => {
  const { classes: css } = useClasses();
  const { tagStore } = useStores();

  const tag = tagStore.getById(id);

  return (
    <Chip
      avatar={<Avatar className={css.count}>{count}</Avatar>}
      label={tag.label}
      className={css.chip}
      {...props}
    />
  );
});

export default Tag;

const useClasses = makeStyles()({
  chip: {
    marginRight: "0.2em",
  },
  count: {
    backgroundColor: colors.blue["800"],
  },
});
