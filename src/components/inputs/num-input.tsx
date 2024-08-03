import { forwardRef, MutableRefObject, useState } from "react";
import { Input, InputProps } from "src/components";
import { toast } from "react-toastify";

export interface NumInputProps extends Omit<InputProps, "setValue" | "value"> {
  maxValue?: number;
  minValue?: number;
  setValue?: (value: number) => void;
  value?: number;
}

export const NumInput = forwardRef(
  (
    { maxValue, minValue, setValue, value, ...props }: NumInputProps,
    ref?: MutableRefObject<HTMLDivElement>
  ) => {
    const [error, setError] = useState<string | null>(null);

    const handleChange = (val: string) => {
      if (!val) {
        setValue?.(null);
        setError(null);
      } else if (isNaN(+val)) toast.error("Must be a number");
      else {
        if (maxValue && +val > maxValue) setError(`Max: ${maxValue}`);
        else if (minValue && +val < minValue) setError(`Min: ${minValue}`);
        else setError(null);
        setValue?.(+val);
      }
    };

    return (
      <Input
        {...{ ref }}
        value={value !== null && !isNaN(+value) ? String(value) : ""}
        setValue={handleChange}
        error={!!error}
        helperText={error}
        hasHelper
        {...props}
      />
    );
  }
);
