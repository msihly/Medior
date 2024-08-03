import { Text, TextProps } from "components";

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
