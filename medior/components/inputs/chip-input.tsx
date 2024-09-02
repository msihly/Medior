import { ComponentProps, useState } from "react";
import { Autocomplete, AutocompleteChangeReason } from "@mui/material";
import { Chip } from "medior/components";
import { Input, InputProps } from ".";
import { colors, makeClasses } from "medior/utils";

export type ChipOption = {
  label: string;
  value: any;
};

export type ChipInputProps = Omit<
  ComponentProps<typeof Autocomplete>,
  "renderInput" | "onChange" | "options"
> & {
  disableWithoutFade?: boolean;
  hasHelper?: boolean;
  inputProps?: InputProps;
  opaque?: boolean;
  options?: ChipOption[];
  setValue?: (val: ChipOption[]) => void;
  value: ChipOption[];
};

export const ChipInput = ({
  className,
  disabled,
  disableWithoutFade,
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
    if (disabled) return;
    setValue?.(
      val.map((v: ChipOption | string) => (typeof v === "string" ? { label: v, value: v } : v))
    );
    if (reason === "createOption") setInputValue("");
  };

  const handleInputChange = (val: string) => {
    if (disabled) return;
    setInputValue(val);
    inputProps?.setValue?.(val);
  };

  return (
    // TODO: Replace with mui-chips-input for ability to edit chips + other config
    <Autocomplete
      {...{ options, value }}
      getOptionLabel={(option: ChipOption) => option.label}
      renderInput={(params) => (
        <Input
          {...params}
          {...{ hasHelper }}
          value={inputValue}
          setValue={handleInputChange}
          disabled={!disableWithoutFade && disabled}
          className={cx(css.input, className)}
          {...inputProps}
        />
      )}
      renderTags={(val: ChipOption[], getTagProps) =>
        val.map((option: ChipOption, index) => {
          const props = { ...getTagProps({ index }) };
          return (
            <Chip
              {...props}
              label={option.label}
              onDelete={disabled ? undefined : props.onDelete}
              size="small"
            />
          );
        })
      }
      onChange={handleChange}
      isOptionEqualToValue={(option: ChipOption, val: ChipOption) => option.value === val.value}
      disabled={!disableWithoutFade && disabled}
      size="small"
      freeSolo
      forcePopupIcon={false}
      clearOnBlur={false}
      disableClearable
      multiple
      {...props}
    />
  );
};

const useClasses = makeClasses(({ opaque }) => ({
  input: {
    backgroundColor: opaque ? colors.foreground : "transparent",
  },
}));
