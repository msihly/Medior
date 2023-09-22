import { ComponentProps, forwardRef, HTMLAttributes, MutableRefObject } from "react";
import { Autocomplete, Chip, colors } from "@mui/material";
import { observer } from "mobx-react-lite";
import { TagOption, useStores } from "store";
import { Input, InputProps, Tag, View } from "components";
import { makeClasses } from "utils";
import { CSSObject } from "tss-react";

export type TagInputProps = Omit<
  ComponentProps<typeof Autocomplete>,
  "renderInput" | "onChange" | "options"
> & {
  autoFocus?: boolean;
  center?: boolean;
  hasHelper?: boolean;
  inputProps?: InputProps;
  label?: string;
  opaque?: boolean;
  options?: TagOption[];
  setValue?: (val: TagOption[]) => void;
  value: TagOption[];
  width?: CSSObject["width"];
};

export const TagInput = observer(
  forwardRef(
    (
      {
        autoFocus = false,
        center,
        className,
        hasHelper = false,
        inputProps,
        label,
        opaque = false,
        options = [],
        setValue,
        value = [],
        width,
        ...props
      }: TagInputProps,
      ref?: MutableRefObject<HTMLDivElement>
    ) => {
      const { tagStore } = useStores();
      const { css, cx } = useClasses({ center, opaque, width });

      return (
        <Autocomplete
          {...{ options, value }}
          getOptionLabel={(option: TagOption) =>
            option?.label ?? tagStore.getById(option.id)?.label
          }
          renderInput={(params) => (
            <Input
              {...params}
              {...{ autoFocus, hasHelper, label, ref, width }}
              className={cx(css.input, className)}
              {...inputProps}
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
            const searchTerms = inputValue.trim().toLowerCase().split(" ");
            return options
              .filter((o) =>
                [o.label.toLowerCase(), ...(o.aliases?.map((a) => a.toLowerCase()) ?? [])].some(
                  (label) => searchTerms.every((t) => label.includes(t))
                )
              )
              .slice(0, 100);
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

const useClasses = makeClasses((_, { center, opaque, width }) => ({
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
    "& .MuiAutocomplete-inputRoot": {
      justifyContent: center ? "center" : undefined,
    },
    "& .MuiAutocomplete-input": {
      // flex: 0,
      // padding: "0 !important",
      minWidth: "0 !important",
    },
  },
  tag: {
    alignSelf: "flex-start",
    marginLeft: 0,
  },
  tagRow: {
    display: "flex",
    flexDirection: "column",
    marginBottom: "0.3rem",
    width,
    "&.MuiAutocomplete-option": {
      padding: "0.2rem 0.5rem",
    },
  },
}));
