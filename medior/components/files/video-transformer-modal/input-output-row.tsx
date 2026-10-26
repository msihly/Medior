import { ReactNode } from "react";
import { Comp, Detail, Icon, Text, View } from "medior/components";

/** Aligns a transform detail's label with the input and output rows' labels. */
export const getDetailLabelProps = (compact: boolean) =>
  ({
    alignSelf: "center",
    fontSize: compact ? "0.9em" : "1em",
    width: compact ? "5rem" : "6rem",
  }) as const;

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
      labelProps={getDetailLabelProps(compact)}
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
