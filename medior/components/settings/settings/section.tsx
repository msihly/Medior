import { ReactNode } from "react";
import { Card, View } from "medior/components";

export interface SectionProps {
  children: ReactNode | ReactNode[];
}

export const Section = ({ children }: SectionProps) => {
  return (
    <View column flex={1} minWidth={0} overflow="hidden auto" padding={{ bottom: "3rem" }}>
      <Card spacing="0.5rem" overflow="initial" minWidth={0}>
        {children}
      </Card>
    </View>
  );
};
