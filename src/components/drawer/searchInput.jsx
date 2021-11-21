import React from "react";
import { Autocomplete, TextField } from "@mui/material";
import { Tag } from "components/tags";
import { makeStyles } from "utils";

const SearchInput = ({ options, setValue, value }) => {
  const { classes: css } = useClasses();

  return (
    <Autocomplete
      {...{ options, value }}
      renderInput={(params) => <TextField {...params} size="small" className={css.input} />}
      renderTags={(val, getTagProps) =>
        val.map((option, index) => (
          <Tag
            {...getTagProps({ index })}
            key={option.label}
            label={option.label}
            count={option.count}
          />
        ))
      }
      onChange={(_, val) => setValue(val)}
      isOptionEqualToValue={(option, val) => option.label === val.label}
      renderOption={(props, option) => (
        <Tag {...props} label={option.label} count={option.count} className={css.tag} />
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
  input: {
    padding: "0.1rem 0.4rem",
    width: "192px",
  },
  tag: {
    marginBottom: "0.5rem",
  },
}));
