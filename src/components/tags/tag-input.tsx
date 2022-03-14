import { ComponentProps } from "react";
import { Autocomplete, colors, TextField } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { Tag, View } from "components";
import { makeStyles } from "utils";
import { CSSObject } from "tss-react";

export type TagOption = {
  count: number;
  id: string;
  label?: string;
};

type TagInputProps = Omit<ComponentProps<typeof Autocomplete>, "renderInput" | "options"> & {
  onChange?: (val: any) => void;
  options?: TagOption[];
  value: TagOption[];
  opaque?: boolean;
};

const TagInput = observer(
  ({
    className,
    onChange = null,
    opaque = false,
    options = [],
    value = [],
    ...props
  }: TagInputProps) => {
    const { tagStore } = useStores();
    const { classes: css, cx } = useClasses({ opaque });

    return (
      <Autocomplete
        {...{ options, value }}
        getOptionLabel={(option: TagOption) => option?.label ?? tagStore.getById(option.id)?.label}
        renderInput={(params) => <TextField {...params} className={cx(css.input, className)} />}
        renderTags={(val: TagOption[], getTagProps) =>
          val.map((option: TagOption, index) => (
            <Tag {...getTagProps({ index })} key={option.id} id={option.id} count={option.count} />
          ))
        }
        onChange={(_, val) => onChange(val)}
        isOptionEqualToValue={(option: TagOption, val: TagOption) => option.id === val.id}
        renderOption={(props, option: TagOption) => (
          <View {...props}>
            <Tag key={option.id} id={option.id} count={option.count} className={css.tag} />
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
);

export default TagInput;

const useClasses = makeStyles<CSSObject>()((_, { opaque }: any) => ({
  input: {
    backgroundColor: opaque ? colors.grey["800"] : "transparent",
  },
  tag: {
    marginBottom: "0.5rem",
  },
}));
