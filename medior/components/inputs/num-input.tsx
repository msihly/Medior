import { forwardRef, MutableRefObject, useState } from "react";
import { Input, InputProps } from "medior/components";
import { toast } from "medior/utils/client";

export interface NumInputProps extends Omit<InputProps, "setValue" | "value"> {
  maxValue?: number;
  minValue?: number;
  setValue?: (value: number) => void;
  value?: number;
}

export const NumInput = forwardRef(
  (
    { hasHelper, maxValue, minValue, setValue, value, ...props }: NumInputProps,
    ref?: MutableRefObject<HTMLDivElement>
  ) => {
    const [error, setError] = useState<string | null>(null);

    const handleChange = (val: string) => {
      if (!val) {
        setValue?.(null);
        setError(null);
      } else if (isNaN(+val)) toast.error("Must be a number");
      else {
        if (maxValue && +val > maxValue)
          hasHelper ? setError(`Max: ${maxValue}`) : toast.error(`Max: ${maxValue}`);
        else if (minValue && +val < minValue)
          hasHelper ? setError(`Min: ${minValue}`) : toast.error(`Min: ${minValue}`);
        else {
          setError(null);
          setValue?.(+val);
        }
      }
    };

    return (
      <Input
        {...{ ref }}
        value={value !== null && !isNaN(+value) ? String(value) : ""}
        setValue={handleChange}
        error={hasHelper && !!error}
        helperText={hasHelper ? error : null}
        hasHelper={hasHelper}
        {...props}
      />
    );
  }
);
