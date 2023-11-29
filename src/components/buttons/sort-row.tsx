import { Icon, IconName, IconProps, Text, View } from "components";
import { SortButton } from ".";
import { makeClasses } from "utils";

export interface SortRowProps {
  attribute: string;
  label: string;
  icon: IconName;
  iconProps?: Partial<IconProps>;
}

export const SortRow = ({ attribute, label, icon, iconProps = {} }: SortRowProps) => {
  const { css } = useClasses(null);

  return (
    <View className={css.row}>
      <Icon name={icon} {...iconProps} />
      <Text className={css.label}>{label}</Text>
      <SortButton {...{ attribute }} isDesc />
      <SortButton {...{ attribute }} />
    </View>
  );
};

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
    padding: "0.5rem 0.8rem",
  },
});
