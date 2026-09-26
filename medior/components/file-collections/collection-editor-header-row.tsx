import { ReactNode } from "react";
import { Text, View } from "medior/components";
import { colors } from "medior/utils/client";

export const HeaderRow = (props: { children: ReactNode | ReactNode[]; label: string }) => {
  return (
    <View row align="center" spacing="0.5rem" overflow="hidden">
      <View column align="flex-start">
        <Text fontSize="1.2em" fontWeight={500} width="3rem" color={colors.custom.lightGrey}>
          {props.label}
        </Text>
      </View>

      {props.children}
    </View>
  );
};
