import { ComponentProps, useState } from "react";
import { observer } from "mobx-react-lite";
import { Autocomplete, AutocompleteChangeReason } from "@mui/material";
import { Chip } from "components";
import { Input, InputProps } from ".";
import { colors, makeClasses } from "utils";

export type ChipOption = {
  label: string;
  value: any;
};

type ChipInputProps = Omit<
  ComponentProps<typeof Autocomplete>,
  "renderInput" | "onChange" | "options"
> & {
  hasHelper?: boolean;
  inputProps?: InputProps;
  opaque?: boolean;
  options?: ChipOption[];
  setValue?: (val: ChipOption[]) => void;
  value: ChipOption[];
};

export const ChipInput = observer(
  ({
    className,
    hasHelper = false,
    inputProps,
    opaque = false,
    options = [],
    setValue,
    value = [],
    ...props
  }: ChipInputProps) => {
    const { css, cx } = useClasses({ opaque });

    const [inputValue, setInputValue] = useState((inputProps?.value ?? "") as string);

    const handleChange = (_, val: ChipOption[], reason?: AutocompleteChangeReason) => {
      setValue?.(
        val.map((v: ChipOption | string) => (typeof v === "string" ? { label: v, value: v } : v))
      );
      if (reason === "createOption") setInputValue("");
    };

    const handleInputChange = (val: string) => {
      setInputValue(val);
      inputProps?.setValue?.(val);
    };

    return (
      <Autocomplete
        {...{ options, value }}
        getOptionLabel={(option: ChipOption) => option.label}
        renderInput={(params) => (
          <Input
            {...params}
            {...{ hasHelper }}
            value={inputValue}
            setValue={handleInputChange}
            className={cx(css.input, className)}
            {...inputProps}
          />
        )}
        renderTags={(val: ChipOption[], getTagProps) =>
          val.map((option: ChipOption, index) => (
            <Chip {...getTagProps({ index })} label={option.label} />
          ))
        }
        onChange={handleChange}
        isOptionEqualToValue={(option: ChipOption, val: ChipOption) => option.value === val.value}
        size="small"
        freeSolo
        forcePopupIcon={false}
        clearOnBlur={false}
        disableClearable
        multiple
        {...props}
      />
    );
  }
);

const useClasses = makeClasses((_, { opaque }) => ({
  input: {
    backgroundColor: opaque ? colors.grey["800"] : "transparent",
  },
}));
