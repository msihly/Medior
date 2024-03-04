import { ReactNode } from "react";
import { Text, View } from "components";
import { colors, makeClasses } from "utils";

export interface SettingsSectionProps {
  children: ReactNode | ReactNode[];
  title: string;
}

export const SettingsSection = ({ children, title }: SettingsSectionProps) => {
  const { css } = useClasses(null);

  return (
    <View spacing="1rem" className={css.container}>
      <Text className={css.title}>{title}</Text>

      <View column spacing="0.4rem">
        {children}
      </View>
    </View>
  );
};

const useClasses = makeClasses({
  container: {
    display: "flex",
    flexDirection: "column",
    backgroundColor: colors.grey["800"],
    borderRadius: "0.5rem",
    padding: "0.5rem",
  },
  title: {
    fontSize: "1.3em",
    fontWeight: 500,
    textAlign: "center",
    overflow: "visible",
  },
});
