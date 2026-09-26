import { ReactNode } from "react";
import { Comp, Detail, Icon, Text, View } from "medior/components";

export interface InputOutputRowProps {
  compact?: boolean;
  input: ReactNode;
  label: string;
  output: ReactNode;
}

export const InputOutputRow = Comp(
  ({ compact = false, input, label, output }: InputOutputRowProps) => (
    <Detail
      row
      label={label}
      labelProps={{
        alignSelf: "center",
        fontSize: compact ? "0.9em" : "1em",
        width: compact ? "5rem" : "6rem",
      }}
      value={
        <View row align="center" spacing={compact ? "0.6rem" : "1rem"}>
          <Text width={compact ? "5.5rem" : "6rem"} whiteSpace="nowrap">
            {input}
          </Text>

          <Icon name="ArrowRightAlt" />

          <Text width={compact ? "5.5rem" : "6rem"} whiteSpace="nowrap">
            {output}
          </Text>
        </View>
      }
    />
  ),
);
