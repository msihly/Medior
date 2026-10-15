import { ReactNode } from "react";
import { Text, View } from "medior/components";
import { colors } from "medior/utils/client";

export const HeaderRow = (props: { children: ReactNode | ReactNode[]; label: string }) => {
  return (
    <View row align="center" spacing="0.5rem" overflow="hidden">
      <Text
        fontSize="1.2em"
        fontWeight={500}
        flex="none"
        width="3rem"
        color={colors.custom.lightGrey}
      >
        {props.label}
      </Text>

      {props.children}
    </View>
  );
};
