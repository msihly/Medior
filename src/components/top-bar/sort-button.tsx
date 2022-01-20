import { IconButton, colors } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { makeStyles } from "utils";
import { KeyboardArrowDown, KeyboardArrowUp } from "@mui/icons-material";

const SortButton = observer(({ attribute, dir }: any) => {
  const { fileStore } = useStores();

  const { classes: css } = useClasses({
    isActive: attribute === fileStore.sortKey && dir === fileStore.sortDir,
  });

  const updateSort = (dir) => {
    fileStore.setSortKey(attribute);
    fileStore.setSortDir(dir);
  };

  return (
    <IconButton onClick={() => updateSort(dir)} className={css.button} size="small">
      {dir === "desc" ? <KeyboardArrowDown /> : <KeyboardArrowUp />}
    </IconButton>
  );
});

export default SortButton;

const useClasses = makeStyles<object>()((_, { isActive }: any) => ({
  attribute: {
    flex: 1,
  },
  button: {
    marginLeft: "0.5rem",
    backgroundColor: isActive ? colors.blue["800"] : colors.grey["700"],
    "&:hover": {
      backgroundColor: isActive ? colors.blue["700"] : colors.grey["600"],
    },
  },
}));
