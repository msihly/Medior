import { ReactNode } from "react";
import { Text, View } from "medior/components";
import { colors, CSS, makeClasses } from "medior/utils/client";

type Row = {
  label: string | ReactNode;
  value: string | ReactNode;
};

interface DetailRowsProps {
  labelWidth?: CSS["maxWidth"];
  rows: Row[];
}

export const DetailRows = ({ labelWidth = "8rem", rows }: DetailRowsProps) => {
  const { css } = useClasses({ labelWidth });

  return (
    <View className={css.table}>
      {rows.map(({ label, value }, i) => (
        <View key={`${i}-${label}`} className={css.row}>
          {typeof label === "string" ? <Text className={css.label}>{label}</Text> : label}
          {typeof value === "string" ? (
            <Text noWrap tooltip={value}>
              {value}
            </Text>
          ) : (
            value
          )}
        </View>
      ))}
    </View>
  );
};

interface ClassesProps {
  labelWidth: CSS["maxWidth"];
}

const useClasses = makeClasses((props: ClassesProps) => ({
  label: {
    flexShrink: 0,
    marginRight: "1rem",
    width: props.labelWidth,
    color: colors.custom.blue,
    fontWeight: "bold",
    whiteSpace: "nowrap",
  },
  row: {
    display: "flex",
    flexFlow: "row nowrap",
  },
  table: {
    display: "flex",
    flexFlow: "column nowrap",
    padding: "0.5rem",
  },
}));
