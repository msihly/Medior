import { ReactNode } from "react";
import { Text, View } from "medior/components";
import { colors, makeClasses } from "medior/utils/client";

export interface GroupProps {
  children: ReactNode | ReactNode[];
  /** Actions for the whole group, beside its title. */
  rightNode?: ReactNode;
  title: string;
}

export const Group = ({ children, rightNode, title }: GroupProps) => {
  const { css } = useClasses(null);

  return (
    <View column spacing="0.5rem" className={css.group}>
      <View row align="center" justify="space-between">
        <Text bold>{title}</Text>

        {rightNode}
      </View>

      {children}
    </View>
  );
};

const useClasses = makeClasses({
  group: {
    "&:not(:first-child)": {
      borderTop: `1px solid ${colors.custom.grey}`,
      paddingTop: "0.5rem",
    },
  },
});
