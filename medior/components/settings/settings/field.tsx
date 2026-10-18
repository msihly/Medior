import { ReactNode } from "react";
import { Text, View } from "medior/components";
import { makeClasses } from "medior/utils/client";

export interface FieldProps {
  /** Keeps the label beside the top of a control taller than one row. */
  alignTop?: boolean;
  children: ReactNode | ReactNode[];
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
      <View column className={cx(alignTop && css.top)}>
        <Text>{label}</Text>

        {description && (
          <Text preset="sub-text" fontSize="0.8em" whiteSpace="normal">
            {description}
          </Text>
        )}
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
