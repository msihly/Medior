import { ReactNode } from "react";
import { Text, View } from "medior/components";
import { colors, makeClasses } from "medior/utils/client";
import { InfoTooltip } from "./info-tooltip";

export interface GroupProps {
  children: ReactNode | ReactNode[];
  /** Details shown from an info icon beside the title. */
  description?: string;
  /** Actions for the whole group, beside its title. */
  rightNode?: ReactNode;
  title: string;
}

export const Group = ({ children, description, rightNode, title }: GroupProps) => {
  const { css } = useClasses(null);

  return (
    <View column spacing="0.5rem" className={css.group}>
      <View row align="center" justify="space-between">
        <View row align="center" spacing="0.3rem">
          <Text bold>{title}</Text>

          {description && <InfoTooltip text={description} />}
        </View>

        {rightNode}
      </View>

      <View column spacing="0.5rem" padding={{ left: "1rem" }}>
        {children}
      </View>
    </View>
  );
};

const useClasses = makeClasses({
  group: {
    "&:not(:first-child)": {
      borderTop: `1px solid ${colors.border}`,
      paddingTop: "0.5rem",
    },
  },
});
