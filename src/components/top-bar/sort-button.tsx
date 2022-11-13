import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { colors } from "@mui/material";
import { IconButton } from "components";
import { makeClasses } from "utils";

interface SortButtonProps {
  attribute: string;
  isDesc?: boolean;
}

export const SortButton = observer(({ attribute, isDesc = false }: SortButtonProps) => {
  const { homeStore } = useStores();
  const { css } = useClasses({
    isActive: attribute === homeStore.sortKey && isDesc === homeStore.isSortDesc,
  });

  const updateSort = () => {
    homeStore.setSortKey(attribute);
    homeStore.setIsSortDesc(isDesc);
  };

  return (
    <IconButton
      name={isDesc ? "KeyboardArrowDown" : "KeyboardArrowUp"}
      onClick={updateSort}
      size="small"
      className={css.button}
    />
  );
});

const useClasses = makeClasses((_, { isActive }) => ({
  attribute: {
    flex: 1,
  },
  button: {
    marginLeft: "0.5rem",
    backgroundColor: isActive ? colors.blue["800"] : colors.grey["800"],
    "&:hover": {
      backgroundColor: isActive ? colors.blue["700"] : colors.grey["700"],
    },
  },
}));
