import { useContext } from "react";
import { colors } from "@mui/material";
import { HomeContext } from "views";
import { IconButton } from "components";
import { makeClasses } from "utils";

interface SortButtonProps {
  attribute: string;
  isDesc?: boolean;
}

export const SortButton = ({ attribute, isDesc = false }: SortButtonProps) => {
  const context = useContext(HomeContext);

  const { classes: css } = useClasses({
    isActive: attribute === context?.sortKey && isDesc === context?.isSortDesc,
  });

  const updateSort = () => {
    context?.setSortKey(attribute);
    context?.setIsSortDesc(isDesc);
  };

  return (
    <IconButton
      name={isDesc ? "KeyboardArrowDown" : "KeyboardArrowUp"}
      onClick={updateSort}
      size="small"
      className={css.button}
    />
  );
};

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
