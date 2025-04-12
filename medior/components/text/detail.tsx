import { ReactNode } from "react";
import { Text, TextProps, View, ViewProps } from "medior/components";
import { CSS, makeClasses } from "medior/utils/client";

export interface DetailProps extends ViewProps {
  emptyValueText?: string;
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
  emptyValueText = "--",
  label,
  labelProps = {},
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
        <Text preset="detail-label" {...labelProps}>
          {label}
        </Text>
      ) : (
        label
      )}

      {!value || typeof value === "string" ? (
        <Text
          tooltip={tooltip ?? (withTooltip ? value : undefined)}
          className={cx(css.value, valueProps?.className)}
          {...valueProps}
        >
          {value || emptyValueText}
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

const useClasses = makeClasses((props: ClassesProps) => ({
  value: {
    overflowX: props.overflowX,
    overflowY: props.overflowY,
    whiteSpace: "nowrap",
  },
}));
