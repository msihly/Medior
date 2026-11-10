import { ReactNode } from "react";
import { Text, View } from "medior/components";
import { makeClasses } from "medior/utils/client";
import { InfoTooltip } from "./info-tooltip";

export interface FieldProps {
  /** Keeps the label beside the top of a control taller than one row. */
  alignTop?: boolean;
  children: ReactNode | ReactNode[];
  /** Details shown from an info icon beside the label, so every row stays one line. */
  description?: string;
  label: string;
  /** Spans the control across the rest of the row. */
  wide?: boolean;
}

/** One label and its control, as two cells of a settings grid. */
export const Field = ({
  alignTop = false,
  children,
  description,
  label,
  wide = false,
}: FieldProps) => {
  const { css, cx } = useClasses(null);

  return (
    <>
      <View row align="center" spacing="0.3rem" className={cx(alignTop && css.top)}>
        <Text>{label}</Text>

        {description && <InfoTooltip text={description} />}
      </View>

      <View row align="center" minWidth={0} spacing="0.5rem" className={cx(wide && css.wide)}>
        {children}
      </View>
    </>
  );
};

const useClasses = makeClasses({
  top: {
    alignSelf: "flex-start",
    paddingTop: "0.5rem",
  },
  wide: {
    gridColumn: "2 / -1",
  },
});
