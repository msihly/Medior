import { Text, TextProps } from "components";
import { colors, makeClasses } from "utils";

export interface SettingsLabelProps extends TextProps {
  label: string;
}

export const SettingsLabel = ({ className, label, ...props }: SettingsLabelProps) => {
  const { css, cx } = useClasses(null);

  return (
    <Text className={cx(css.label, className)} {...props}>
      {label}
    </Text>
  );
};

const useClasses = makeClasses({
  label: {
    fontSize: "0.8em",
    textShadow: `0 0 10px ${colors.blue["600"]}`,
    whiteSpace: "nowrap",
  },
});
