import { ReactNode } from "react";
import { Text, TextProps, View } from "components";
import { colors, makeClasses } from "utils";
import { CSSObject } from "tss-react";

export interface DetailProps {
  label: ReactNode;
  labelProps?: Partial<TextProps>;
  overflowX?: CSSObject["overflowX"];
  overflowY?: CSSObject["overflowY"];
  tooltip?: ReactNode;
  value: ReactNode;
  valueProps?: Partial<TextProps>;
  withTooltip?: boolean;
}

export const Detail = ({
  label,
  labelProps,
  overflowX = "auto",
  overflowY = "hidden",
  tooltip,
  value,
  valueProps,
  withTooltip,
}: DetailProps) => {
  const { css, cx } = useClasses({ overflowX, overflowY });

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
          tooltip={tooltip ?? (withTooltip ? value : undefined)}
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

interface ClassesProps {
  overflowX: CSSObject["overflowX"];
  overflowY: CSSObject["overflowY"];
}

const useClasses = makeClasses((_, { overflowX, overflowY }: ClassesProps) => ({
  label: {
    fontSize: "0.8em",
    color: colors.blue["500"],
  },
  value: {
    overflowX,
    overflowY,
    whiteSpace: "nowrap",
  },
}));
