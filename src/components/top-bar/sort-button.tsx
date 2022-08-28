import { colors } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { makeClasses } from "utils";
import { IconButton } from "components";

interface SortButtonProps {
  attribute: string;
  dir: "asc" | "desc";
}

const SortButton = observer(({ attribute, dir }: SortButtonProps) => {
  const { fileStore } = useStores();

  const { classes: css } = useClasses({
    isActive: attribute === fileStore.sortKey && dir === fileStore.sortDir,
  });

  const updateSort = () => {
    fileStore.setSortKey(attribute);
    fileStore.setSortDir(dir);
  };

  return (
    <IconButton
      name={dir === "desc" ? "KeyboardArrowDown" : "KeyboardArrowUp"}
      onClick={updateSort}
      size="small"
      className={css.button}
    />
  );
});

export default SortButton;

const useClasses = makeClasses((_, { isActive }) => ({
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
