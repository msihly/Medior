import { ReactNode } from "react";
import { Text, View } from "components";
import { makeClasses } from "utils";
import { CSSObject } from "tss-react";

type Row = {
  label: string | ReactNode;
  value: string | ReactNode;
};

interface DetailRowsProps {
  labelWidth?: CSSObject["maxWidth"];
  rows: Row[];
}

export const DetailRows = ({ labelWidth = "8rem", rows }: DetailRowsProps) => {
  const { css } = useClasses({ labelWidth });

  return (
    <View className={css.table}>
      {rows.map(({ label, value }, i) => (
        <View key={`${i}-${label}`} className={css.row}>
          {typeof label === "string" ? <Text className={css.label}>{label}</Text> : label}
          {typeof value === "string" ? <Text noWrap>{value}</Text> : value}
        </View>
      ))}
    </View>
  );
};

const useClasses = makeClasses((_, { labelWidth }) => ({
  label: {
    flexShrink: 0,
    marginRight: "1rem",
    width: labelWidth,
    fontWeight: "bold",
    whiteSpace: "nowrap",
  },
  labels: {
    display: "flex",
    flexFlow: "column nowrap",
    padding: "0.5rem",
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
  values: {
    display: "flex",
    flexFlow: "column nowrap",
    padding: "0.5rem",
    overflow: "hidden",
  },
}));
