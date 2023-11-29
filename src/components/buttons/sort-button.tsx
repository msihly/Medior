import { useContext } from "react";
import { observer } from "mobx-react-lite";
import { IconButton } from "components";
import { SortMenuContext } from "./sort-menu";
import { colors, makeClasses } from "utils";
import Color from "color";

export interface SortButtonProps {
  attribute: string;
  isDesc?: boolean;
}

export const SortButton = observer(({ attribute, isDesc = false }: SortButtonProps) => {
  const ctx = useContext(SortMenuContext);

  const isActive = attribute === ctx.sortKey && isDesc === ctx.isSortDesc;
  const color = isActive ? colors.blue["700"] : colors.grey["700"];

  const { css } = useClasses({ color });

  const updateSort = () => {
    const hasSortDescDiff = ctx.isSortDesc !== isDesc;
    const hasSortKeyDiff = ctx.sortKey !== attribute;
    if (hasSortKeyDiff) ctx.setSortKey(attribute);
    if (hasSortDescDiff) ctx.setIsSortDesc(isDesc);
    if (hasSortDescDiff || hasSortKeyDiff) ctx.onChange?.();
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
