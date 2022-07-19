import { Typography } from "@mui/material";
import { Icon, IconName, View } from "components";
import { SortButton } from ".";
import { makeClasses } from "utils";

interface SortRowProps {
  attribute: string;
  label: string;
  icon: IconName;
}

const SortRow = ({ attribute, label, icon }: SortRowProps) => {
  const { classes: css } = useClasses(null);

  return (
    <View className={css.row}>
      <Icon name={icon} />
      <Typography className={css.label}>{label}</Typography>
      <SortButton {...{ attribute }} dir="desc" />
      <SortButton {...{ attribute }} dir="asc" />
    </View>
  );
};

export default SortRow;

const useClasses = makeClasses({
  label: {
    flex: 1,
    whiteSpace: "nowrap",
    padding: "0 0.5rem",
  },
  row: {
    display: "flex",
    flexFlow: "row nowrap",
    alignItems: "center",
    padding: "0.5rem",
  },
});
