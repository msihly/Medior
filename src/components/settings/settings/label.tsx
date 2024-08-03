import { Text, TextProps } from "src/components";

export interface LabelProps extends TextProps {
  label: string;
}

export const Label = ({ label, ...props }: LabelProps) => {
  return (
    <Text preset="label-glow" whiteSpace="nowrap" {...props}>
      {label}
    </Text>
  );
};
