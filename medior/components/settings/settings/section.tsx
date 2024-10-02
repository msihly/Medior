import { ReactNode } from "react";
import { Card, Text, UniformList, View } from "medior/components";

export interface SectionProps {
  children: ReactNode | ReactNode[];
  leftNode?: ReactNode;
  rightNode?: ReactNode;
  title: string;
}

export const Section = ({ children, leftNode, rightNode, title }: SectionProps) => {
  return (
    <Card spacing="1rem" overflow="initial">
      <UniformList row align="center" justify="space-between">
        <View row justify="flex-start">
          {leftNode}
        </View>

        <Text preset="title">{title}</Text>

        <View row justify="flex-end">
          {rightNode}
        </View>
      </UniformList>

      <View column spacing="0.5rem">
        {children}
      </View>
    </Card>
  );
};
