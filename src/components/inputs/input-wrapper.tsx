import { Text, TextProps, View, ViewProps } from "components";

export interface InputWrapperProps extends Partial<ViewProps> {
  children: JSX.Element;
  label: string;
  labelProps?: Partial<TextProps>;
  labelSuffix?: JSX.Element;
}

export const InputWrapper = ({
  children,
  label,
  labelProps = {},
  labelSuffix,
  ...viewProps
}: InputWrapperProps) => {
  return (
    <View column flex={1} {...viewProps}>
      <View row justify="center">
        <Text preset="label-glow" {...labelProps}>
          {label}
        </Text>

        {labelSuffix}
      </View>

      {children}
    </View>
  );
};
