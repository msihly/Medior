import { observer } from "mobx-react-lite";
import { RegExMap, TagOption, useStores } from "store";
import { Button, Icon, IconName, Input, InputProps, TagInput, View } from "components";
import { colors, makeClasses } from "utils";
import { InputAdornment } from "@mui/material";
import { useMemo } from "react";

const STATUS_META: { [key: string]: { color: string; icon: IconName } } = {
  create: {
    color: colors.green["700"],
    icon: "AddCircle",
  },
  delete: {
    color: colors.red["700"],
    icon: "Delete",
  },
  edit: {
    color: colors.blue["700"],
    icon: "Edit",
  },
};

type Status = keyof typeof STATUS_META;

export interface RegExMapRowProps {
  map: RegExMap;
}

export const RegExMapRow = observer(({ map }: RegExMapRowProps) => {
  const { css } = useClasses(null);

  const { tagStore } = useStores();

  const [isRegExValid, isTestStringValid] = useMemo(() => {
    try {
      const regEx = new RegExp(map.regEx, "im");
      return [true, map.testString?.length > 0 ? regEx.test(map.testString) : true];
    } catch (error) {
      return [false, false];
    }
  }, [map.regEx, map.testString]);

  const status: Status = map.isDeleted
    ? "delete"
    : !map.id
    ? "create"
    : map.hasUnsavedChanges
    ? "edit"
    : null;

  const tags =
    map.type !== "folderToCollection"
      ? map.tagIds.map((id) => tagStore.getById(id)?.tagOption)
      : [];

  const handleTagsChange = (value: TagOption[]) =>
    map.update({ tagIds: value.map((opt) => opt.id) });

  // const setDelimiter = (value: string) => map.setDelimiter(value);

  const setRegEx = (value: string) => map.setRegEx(value);

  const setTestString = (value: string) => map.setTestString(value);

  const setTitle = (value: string) => map.setTitle(value);

  const toggleDeleted = () => map.toggleDeleted();

  const inputProps: Partial<InputProps> = {
    disabled: map.isDeleted,
    hasHelper: true,
    InputLabelProps: { shrink: true },
    width: "-webkit-fill-available",
  };

  return (
    <View className={css.row}>
      {status ? (
        <Icon
          name={STATUS_META[status].icon}
          color={STATUS_META[status].color}
          size="1.8em"
          margins={{ top: "0.3rem" }}
        />
      ) : (
        <View padding={{ right: "1.8em" }} />
      )}

      <Input
        {...inputProps}
        label="RegExp"
        value={map.regEx}
        setValue={setRegEx}
        error={!isRegExValid}
        helperText={!isRegExValid ? "Invalid RegExp" : null}
        InputProps={{
          endAdornment: <InputAdornment position="end">{"/"}</InputAdornment>,
          startAdornment: <InputAdornment position="start">{"/"}</InputAdornment>,
        }}
      />

      <Input
        {...inputProps}
        label="Test String"
        value={map.testString}
        setValue={setTestString}
        error={!isTestStringValid}
        helperText={!isTestStringValid ? "Does not match RegExp" : null}
      />

      <Icon name="KeyboardDoubleArrowRight" size="1.8em" margins={{ top: "0.4rem" }} />

      {map.type === "folderToCollection" ? (
        <Input {...inputProps} label="Title" value={map.title} setValue={setTitle} />
      ) : (
        <TagInput
          label="Tags"
          value={tags}
          options={tagStore.tagOptions}
          onChange={handleTagsChange}
          disabled={inputProps.disabled}
          width={inputProps.width}
          hasCreate
        />
      )}

      <Button
        icon={map.isDeleted ? "Reply" : "Delete"}
        iconSize="1.8em"
        onClick={toggleDeleted}
        color={colors.button.red}
      />
    </View>
  );
});

const useClasses = makeClasses({
  row: {
    display: "flex",
    flexDirection: "row",
    alignItems: "flex-start",
    width: "100%",
    "& > *:not(:last-child)": {
      marginRight: "0.5rem",
    },
  },
});
