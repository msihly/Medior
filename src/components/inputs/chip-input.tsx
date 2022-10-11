import { ComponentProps } from "react";
import { Autocomplete, Chip, colors } from "@mui/material";
import { observer } from "mobx-react-lite";
import { Input } from ".";
import { makeClasses } from "utils";

export type ChipOption = {
  label: string;
  value: any;
};

type ChipInputProps = Omit<
  ComponentProps<typeof Autocomplete>,
  "renderInput" | "onChange" | "options"
> & {
  opaque?: boolean;
  options?: ChipOption[];
  setValue?: (val: any) => void;
  value: ChipOption[];
};

export const ChipInput = observer(
  ({ className, opaque = false, options = [], setValue, value = [], ...props }: ChipInputProps) => {
    const { classes: css, cx } = useClasses({ opaque });

    return (
      <Autocomplete
        {...{ options, value }}
        getOptionLabel={(option: ChipOption) => option.label}
        renderInput={(params) => <Input {...params} className={cx(css.input, className)} />}
        renderTags={(val: ChipOption[], getTagProps) =>
          val.map((option: ChipOption, index) => (
            <Chip {...getTagProps({ index })} label={option.label} />
          ))
        }
        onChange={(_, val: ChipOption[] | string[]) => {
          setValue?.(
            val.map((v: ChipOption | string) =>
              typeof v === "string" ? { label: v, value: v } : v
            )
          );
        }}
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
