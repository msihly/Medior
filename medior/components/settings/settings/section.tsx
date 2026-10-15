import { ReactNode } from "react";
import { Accordion, Card, Text, UniformList, View } from "medior/components";
import { colors } from "medior/utils/client";

export interface SectionProps {
  children: ReactNode | ReactNode[];
  leftNode?: ReactNode;
  rightNode?: ReactNode;
  title: string;
}

export const Section = ({ children, leftNode, rightNode, title }: SectionProps) => {
  return (
    <Accordion
      fullWidth
      expanded
      color={colors.custom.black}
      header={
        <UniformList row align="center" justify="space-between" width="100%">
          <View row justify="flex-start">
            {leftNode}
          </View>

          <Text preset="title">{title}</Text>

          <View row justify="flex-end">
            {rightNode}
          </View>
        </UniformList>
      }
    >
      <Card spacing="0.5rem" overflow="initial" minWidth={0} borderRadiuses={{ top: 0 }}>
        {children}
      </Card>
    </Accordion>
  );
};
