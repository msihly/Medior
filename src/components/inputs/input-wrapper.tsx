import { Text, TextProps, View, ViewProps } from "components";

export interface InputWrapperProps extends Partial<ViewProps> {
  children: JSX.Element;
  label: string;
  labelProps?: Partial<TextProps>;
}

export const InputWrapper = ({
  children,
  label,
  labelProps = {},
  ...viewProps
}: InputWrapperProps) => {
  return (
    <View column flex={1} {...viewProps}>
      <Text preset="label-glow" {...labelProps}>
        {label}
      </Text>
      {children}
    </View>
  );
};
