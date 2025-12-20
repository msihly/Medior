import { useState } from "react";
import { Comp, Input, InputProps } from "medior/components";
import { toast } from "medior/utils/client";

export interface NumInputProps extends Omit<InputProps, "setValue" | "value"> {
  maxValue?: number;
  minValue?: number;
  setValue?: (value: number) => void;
  setValueDisplay?: (value: string) => void;
  value?: number;
  valueDisplay?: string;
}

export const NumInput = Comp(
  (
    {
      hasHelper,
      maxValue,
      minValue,
      setValue,
      setValueDisplay,
      value,
      valueDisplay,
      ...props
    }: NumInputProps,
    ref,
  ) => {
    const [error, setError] = useState<string | null>(null);

    const handleChange = (val: string) => {
      if (!val) {
        setValue?.(null);
        setValueDisplay?.(null);
        setError(null);
      } else if (setValueDisplay) {
        setValueDisplay(val);
      } else if (isNaN(+val)) {
        toast.error("Must be a number");
      } else {
        setValue?.(+val);
        if (maxValue && +val > maxValue)
          hasHelper ? setError(`Max: ${maxValue}`) : toast.error(`Max: ${maxValue}`);
        else if (minValue && +val < minValue)
          hasHelper ? setError(`Min: ${minValue}`) : toast.error(`Min: ${minValue}`);
        else setError(null);
      }
    };

    return (
      <Input
        ref={ref}
        value={valueDisplay ?? (value !== null && !isNaN(+value) ? String(value) : "")}
        setValue={handleChange}
        error={hasHelper && !!error}
        helperText={hasHelper ? error : null}
        hasHelper={hasHelper}
        {...props}
      />
    );
  },
);
