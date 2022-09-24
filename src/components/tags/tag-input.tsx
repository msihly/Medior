import { ComponentProps, forwardRef, HTMLAttributes, MutableRefObject } from "react";
import { Autocomplete, colors, TextField } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { Tag, View } from "components";
import { makeClasses } from "utils";

export type TagOption = {
  aliases?: string[];
  count: number;
  id: string;
  label?: string;
};

type TagInputProps = Omit<
  ComponentProps<typeof Autocomplete>,
  "renderInput" | "onChange" | "options"
> & {
  autoFocus?: boolean;
  label?: string;
  opaque?: boolean;
  options?: TagOption[];
  setValue?: (val: TagOption[]) => void;
  value: TagOption[];
};

const TagInput = observer(
  forwardRef(
    (
      {
        autoFocus = false,
        className,
        label,
        opaque = false,
        options = [],
        setValue,
        value = [],
        ...props
      }: TagInputProps,
      ref?: MutableRefObject<HTMLDivElement>
    ) => {
      const { tagStore } = useStores();
      const { classes: css, cx } = useClasses({ opaque });

      return (
        <Autocomplete
          {...{ options, value }}
          getOptionLabel={(option: TagOption) =>
            option?.label ?? tagStore.getById(option.id)?.label
          }
          renderInput={(params) => (
            <TextField
              {...params}
              {...{ autoFocus, label, ref }}
              className={cx(css.input, className)}
            />
          )}
          renderTags={(val: TagOption[], getTagProps) =>
            val.map((option: TagOption, index) => (
              <Tag {...getTagProps({ index })} key={option.id} id={option.id} />
            ))
          }
          onChange={(_, val: TagOption[]) => setValue?.(val)}
          isOptionEqualToValue={(option: TagOption, val: TagOption) => option.id === val.id}
          filterOptions={(options: TagOption[], { inputValue }) => {
            const searchStr = inputValue.trim().toLowerCase();
            return options.filter((o) =>
              [o.label.toLowerCase(), ...(o.aliases?.map((a) => a.toLowerCase()) ?? [])].some(
                (label) => label.includes(searchStr)
              )
            );
          }}
          renderOption={(
            props: HTMLAttributes<HTMLLIElement> & HTMLAttributes<HTMLDivElement>,
            option: TagOption
          ) => (
            <View {...props}>
              <Tag key={option.id} id={option.id} className={css.tag} />
            </View>
          )}
          size="small"
          forcePopupIcon={false}
          clearOnBlur={false}
          disableClearable
          multiple
          {...props}
        />
      );
    }
  )
);

export default TagInput;

const useClasses = makeClasses((_, { opaque }) => ({
  input: {
    backgroundColor: opaque ? colors.grey["800"] : "transparent",
  },
  tag: {
    marginBottom: "0.5rem",
  },
}));
