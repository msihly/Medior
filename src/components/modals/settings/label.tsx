import { Text, TextProps } from "components";

export interface SettingsLabelProps extends TextProps {
  label: string;
}

export const SettingsLabel = ({ label, ...props }: SettingsLabelProps) => {
  return (
    <Text preset="label-glow" whiteSpace="nowrap" {...props}>
      {label}
    </Text>
  );
};
