import { ReactNode } from "react";
import { Text, TextProps, View } from "components";
import { colors, makeClasses } from "utils";

export interface DetailProps {
  label: ReactNode;
  labelProps?: Partial<TextProps>;
  value: ReactNode;
  valueProps?: Partial<TextProps>;
  withTooltip?: boolean;
}

export const Detail = ({ label, labelProps, value, valueProps, withTooltip }: DetailProps) => {
  const { css, cx } = useClasses(null);

  return (
    <View column>
      {typeof label === "string" ? (
        <Text {...labelProps} className={cx(css.label, labelProps?.className)}>
          {label}
        </Text>
      ) : (
        label
      )}
      {typeof value === "string" ? (
        <Text
          tooltip={withTooltip ? value : undefined}
          {...valueProps}
          className={cx(css.value, valueProps?.className)}
        >
          {value}
        </Text>
      ) : (
        value
      )}
    </View>
  );
};

const useClasses = makeClasses({
  label: {
    fontSize: "0.8em",
    color: colors.blue["500"],
  },
  value: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});
