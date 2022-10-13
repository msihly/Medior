import { Typography } from "@mui/material";
import { Icon, IconName, IconProps, View } from "components";
import { SortButton } from ".";
import { makeClasses } from "utils";

interface SortRowProps {
  attribute: string;
  label: string;
  icon: IconName;
  iconProps?: Partial<IconProps>;
}

const SortRow = ({ attribute, label, icon, iconProps = {} }: SortRowProps) => {
  const { classes: css } = useClasses(null);

  return (
    <View className={css.row}>
      <Icon name={icon} {...iconProps} />
      <Typography className={css.label}>{label}</Typography>
      <SortButton {...{ attribute }} isDesc />
      <SortButton {...{ attribute }} />
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
