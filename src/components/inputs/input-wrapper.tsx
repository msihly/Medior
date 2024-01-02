import { Text, TextProps, View, ViewProps } from "components";
import { colors, makeClasses } from "utils";

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
  const { css, cx } = useClasses(null);

  return (
    <View column flex={1} {...viewProps}>
      <Text {...labelProps} className={cx(css.label, labelProps?.className)}>
        {label}
      </Text>
      {children}
    </View>
  );
};

const useClasses = makeClasses({
  label: {
    fontSize: "0.8em",
    textAlign: "center",
    textShadow: `0 0 10px ${colors.blue["600"]}`,
  },
});
