import { ComponentProps, forwardRef, HTMLAttributes, MutableRefObject } from "react";
import { Autocomplete, Chip, colors, TextField } from "@mui/material";
import { observer } from "mobx-react-lite";
import { TagOption, useStores } from "store";
import { Tag, View } from "components";
import { makeClasses } from "utils";

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

export const TagInput = observer(
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
      const { css, cx } = useClasses({ opaque });

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
            <View {...props} className={cx(props.className, css.tagRow)}>
              <Tag key={option.id} id={option.id} className={css.tag} />

              {option.aliases?.length > 0 && (
                <View className={css.aliases}>
                  {option.aliases.map((a) => (
                    <Chip key={a} label={a} size="small" className={css.alias} />
                  ))}
                </View>
              )}
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

const useClasses = makeClasses((_, { opaque }) => ({
  alias: {
    margin: "0.3rem 0 0 0.3rem",
    fontSize: "0.7em",
    opacity: 0.7,
  },
  aliases: {
    display: "flex",
    flexFlow: "row wrap",
    alignSelf: "flex-start",
  },
  input: {
    backgroundColor: opaque ? colors.grey["800"] : "transparent",
  },
  tag: {
    alignSelf: "flex-start",
    marginLeft: 0,
  },
  tagRow: {
    display: "flex",
    flexDirection: "column",
    marginBottom: "0.3rem",
    "&.MuiAutocomplete-option": {
      padding: "0.2rem 0.5rem",
    },
  },
}));
