import { reloadDisplayedFiles } from "database";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { colors } from "@mui/material";
import { IconButton } from "components";
import { makeClasses } from "utils";
import Color from "color";

interface SortButtonProps {
  attribute: string;
  isDesc?: boolean;
}

export const SortButton = observer(({ attribute, isDesc = false }: SortButtonProps) => {
  const rootStore = useStores();
  const { homeStore } = useStores();

  const isActive = attribute === homeStore.sortKey && isDesc === homeStore.isSortDesc;
  const color = isActive ? colors.blue["700"] : colors.grey["700"];

  const { css } = useClasses({ color });

  const updateSort = () => {
    const hasSortDescDiff = homeStore.isSortDesc !== isDesc;
    const hasSortKeyDiff = homeStore.sortKey !== attribute;
    if (hasSortKeyDiff) homeStore.setSortKey(attribute);
    if (hasSortDescDiff) homeStore.setIsSortDesc(isDesc);
    if (hasSortDescDiff || hasSortKeyDiff)
      reloadDisplayedFiles(rootStore, { page: 1, withAppend: true });
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

const useClasses = makeClasses((_, { color }) => ({
  attribute: {
    flex: 1,
  },
  button: {
    marginLeft: "0.5rem",
    background: `linear-gradient(to bottom right, ${color}, ${Color(color).darken(0.3).string()})`,
    "&:hover": {
      background: `linear-gradient(to bottom right, ${Color(color).lighten(0.1).string()}, ${Color(
        color
      )
        .darken(0.2)
        .string()})`,
    },
  },
}));
