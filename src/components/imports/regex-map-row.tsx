import { CSSProperties, useMemo } from "react";
import { observer } from "mobx-react-lite";
import { TagOption, useStores } from "store";
import { InputAdornment } from "@mui/material";
import { Button, Icon, IconName, Input, InputProps, TagInput, View } from "components";
import { colors, makeClasses } from "utils";

export const REGEX_ROW_CARD_HEIGHT = 95;
export const REGEX_ROW_HEIGHT = REGEX_ROW_CARD_HEIGHT + 20;

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
  index: number;
  style?: CSSProperties;
}

export const RegExMapRow = observer(({ index, style }: RegExMapRowProps) => {
  const { css, cx } = useClasses(null);

  const { importStore, tagStore } = useStores();

  const map = importStore.filteredRegExMaps[importStore.filteredRegExMaps.length - 1 - index];

  const [isRegExValid, isTestStringValid] = useMemo(() => {
    try {
      const regEx = new RegExp(map?.regEx, "im");
      return [true, map?.testString?.length > 0 ? regEx.test(map.testString) : true];
    } catch (error) {
      return [false, false];
    }
  }, [map?.regEx, map?.testString]);

  const status: Status = map?.isDeleted
    ? "delete"
    : !map?.id
    ? "create"
    : map?.hasUnsavedChanges
    ? "edit"
    : null;

  const tags = map?.tagIds?.map((id) => tagStore.getById(id)?.tagOption);

  const genRegExFromTags = () => setRegEx(tagStore.tagsToRegEx(tags));

  const handleTagsChange = (value: TagOption[]) => map.setTagIds(value.map((opt) => opt.id));

  const handleTagClick = (id: string) => {
    tagStore.setActiveTagId(id);
    tagStore.setIsTagEditorOpen(true);
  };

  const setRegEx = (value: string) => map.setRegEx(value);

  const setTestString = (value: string) => map.setTestString(value);

  const toggleDeleted = () => map.toggleDeleted();

  const toggleTypeDiffusion = () => map.toggleType("diffusionParams");

  const toggleTypeFile = () => map.toggleType("fileName");

  const toggleTypeFolder = () => map.toggleType("folderName");

  const inputProps: Partial<InputProps> = {
    className: css.input,
    disabled: map?.isDeleted,
    hasHelper: true,
    InputLabelProps: { shrink: true },
  };

  return !map ? (
    <View className={css.root} {...{ style }} />
  ) : (
    <View className={css.root} {...{ style }}>
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

        <View className={css.buttons}>
          <Button
            icon="InsertDriveFile"
            iconSize="1.8em"
            tooltip="File Name"
            onClick={toggleTypeFile}
            color={map.types.includes("fileName") ? colors.button.blue : colors.button.grey}
          />

          <Button
            icon="Folder"
            iconSize="1.8em"
            tooltip="Folder Name"
            onClick={toggleTypeFolder}
            color={map.types.includes("folderName") ? colors.button.blue : colors.button.grey}
          />

          <Button
            icon="TextSnippet"
            iconSize="1.8em"
            tooltip="Diffusion Parameters"
            onClick={toggleTypeDiffusion}
            color={map.types.includes("diffusionParams") ? colors.button.blue : colors.button.grey}
          />

          <Button
            icon={map.isDeleted ? "Reply" : "Delete"}
            iconSize="1.8em"
            onClick={toggleDeleted}
            color={colors.button.red}
          />
        </View>

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

        <Button
          icon="AccountTree"
          iconSize="1.8em"
          onClick={genRegExFromTags}
          tooltip="Generate RegEx From Tags"
        />

        <TagInput
          label="Tags"
          value={tags}
          onChange={handleTagsChange}
          onTagClick={handleTagClick}
          hasCreate
          hasDelete
          inputProps={{
            ...inputProps,
            helperText: !tags.length ? "Must have tags" : null,
            error: !tags.length,
          }}
          className={cx(css.input, css.tagInput)}
        />
      </View>
    </View>
  );
});

const useClasses = makeClasses({
  buttons: {
    display: "flex",
    flexDirection: "row",
    "& > *:not(:last-child)": {
      marginRight: "0.5rem",
    },
  },
  input: {
    minWidth: "15rem",
  },
  root: {
    display: "flex",
    flexDirection: "row",
    flex: 1,
    width: "fit-content",
  },
  row: {
    display: "flex",
    flexDirection: "row",
    flex: 1,
    alignItems: "flex-start",
    borderRadius: "0.5rem",
    padding: "1.2rem 1rem 0.4rem 0.5rem",
    height: REGEX_ROW_CARD_HEIGHT,
    backgroundColor: colors.grey["800"],
    "& > *:not(:last-child)": {
      marginRight: "0.5rem",
    },
  },
  tagInput: {
    "& .MuiAutocomplete-inputRoot": {
      flexWrap: "nowrap",
      overflow: "hidden",
    },
  },
});
