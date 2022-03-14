import { Autocomplete, TextField } from "@mui/material";
import { Tag, View } from "components";
import { makeStyles } from "utils";

const SearchInput = ({ className = null, onChange, options = [], value = [] }) => {
  const { classes: css } = useClasses();

  return (
    <Autocomplete
      {...{ options, value }}
      renderInput={(params) => <TextField {...params} size="small" className={className} />}
      renderTags={(val, getTagProps) =>
        val.map((option, index) => (
          <Tag {...getTagProps({ index })} key={option.id} id={option.id} count={option.count} />
        ))
      }
      onChange={(_, val) => onChange(val)}
      isOptionEqualToValue={(option, val) => option.label === val.label}
      renderOption={(props, option) => (
        <View {...props}>
          <Tag key={option.id} id={option.id} count={option.count} className={css.tag} />
        </View>
      )}
      size="small"
      forcePopupIcon={false}
      clearOnBlur={false}
      disableClearable
      limitTags={3}
      multiple
    />
  );
};

export default SearchInput;

const useClasses = makeStyles()(() => ({
  tag: {
    marginBottom: "0.5rem",
  },
}));
