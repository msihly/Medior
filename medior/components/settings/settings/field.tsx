import { ReactNode, useContext, useId, useLayoutEffect, useRef } from "react";
import { Text, View } from "medior/components";
import { makeClasses } from "medior/utils/client";
import { InfoTooltip } from "./info-tooltip";
import { LabelColumnsContext } from "./label-columns";

export interface FieldProps {
  /** Keeps the label beside the top of a control taller than one row. */
  alignTop?: boolean;
  children: ReactNode | ReactNode[];
  /** Details shown from an info icon beside the label, so every row stays one line. */
  description?: string;
  label: string;
  /** Stretches the control across the rest of the line. */
  wide?: boolean;
}

/** A label followed directly by its control, as wide as the widest label in its column. */
export const Field = ({
  alignTop = false,
  children,
  description,
  label,
  wide = false,
}: FieldProps) => {
  const columns = useContext(LabelColumnsContext);

  const { css, cx } = useClasses(null);

  const id = useId();
  const labelRef = useRef<HTMLDivElement>(null);

  // Measured before paint, so labels never show at their own widths first.
  useLayoutEffect(() => {
    const labelEl = labelRef.current;

    const measure = () => {
      // A hidden view measures zero, so its labels keep their widths for when it shows again.
      const { left, width } = labelEl.getBoundingClientRect();
      if (!width) return;

      columns.setLabel(id, { left: Math.round(left), width });
    };

    const observer = new ResizeObserver(measure);

    observer.observe(labelEl);
    window.addEventListener("resize", measure);
    measure();

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      columns.removeLabel(id);
    };
  }, []);

  return (
    <View row align="center" minWidth={0} spacing="1rem">
      <View row flex="none" minWidth={columns.getWidth(id)} className={cx(alignTop && css.top)}>
        <View ref={labelRef} row align="center" spacing="0.3rem">
          <Text>{label}</Text>

          {description && <InfoTooltip text={description} />}
        </View>
      </View>

      <View row flex={wide ? 1 : undefined} align="center" minWidth={0} spacing="0.5rem">
        {children}
      </View>
    </View>
  );
};

const useClasses = makeClasses({
  top: {
    alignSelf: "flex-start",
    paddingTop: "0.5rem",
  },
});
