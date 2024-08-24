import { ReactNode } from "react";
import { Text, TextProps, View, ViewProps } from "medior/components";
import { CSS, colors, makeClasses } from "medior/utils";

export interface DetailProps extends ViewProps {
  label: ReactNode;
  labelProps?: Partial<TextProps>;
  overflowX?: CSS["overflowX"];
  overflowY?: CSS["overflowY"];
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
  row = false,
  tooltip,
  value,
  valueProps,
  withTooltip,
  ...props
}: DetailProps) => {
  const { css, cx } = useClasses({ overflowX, overflowY });

  return (
    <View column={!row} row={row} spacing={row ? "0.5rem" : null} {...props}>
      {typeof label === "string" ? (
        <Text color={colors.custom.blue} fontWeight={500} whiteSpace="nowrap" {...labelProps}>
          {label}
        </Text>
      ) : (
        label
      )}
      {typeof value === "string" ? (
        <Text
          tooltip={tooltip ?? (withTooltip ? value : undefined)}
          className={cx(css.value, valueProps?.className)}
          {...valueProps}
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
  overflowX: CSS["overflowX"];
  overflowY: CSS["overflowY"];
}

const useClasses = makeClasses((_, { overflowX, overflowY }: ClassesProps) => ({
  value: {
    overflowX,
    overflowY,
    whiteSpace: "nowrap",
  },
}));
