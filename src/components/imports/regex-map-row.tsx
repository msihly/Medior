import { useMemo } from "react";
import { RegExMapType } from "database";
import { observer } from "mobx-react-lite";
import { Tag, useStores } from "store";
import { InputAdornment } from "@mui/material";
import { Button, Input, InputProps, View } from "components";
import { colors, makeClasses } from "utils";

export interface RegExMapRowProps {
  aliases: Tag["aliases"];
  disabled?: boolean;
  label: Tag["label"];
  regEx: string;
  setRegEx: (regEx: string) => void;
  setTestString: (testString: string) => void;
  setTypes: (types: RegExMapType[]) => void;
  testString: string;
  types: RegExMapType[];
}

export const RegExMapRow = observer(
  ({
    aliases,
    disabled = false,
    label,
    regEx,
    setRegEx,
    setTestString,
    setTypes,
    testString,
    types,
  }: RegExMapRowProps) => {
    const { css } = useClasses(null);

    const stores = useStores();

    const [isRegExValid, isTestStringValid] = useMemo(() => {
      try {
        return [true, testString.length > 0 ? new RegExp(regEx, "im").test(testString) : true];
      } catch (error) {
        return [false, false];
      }
    }, [regEx, testString]);

    const generateRegEx = () => setRegEx(stores.tag.tagsToRegEx([{ aliases, label }]));

    const toggleType = (type: RegExMapType) =>
      setTypes(types.includes(type) ? types.filter((t) => t !== type) : [...types, type]);

    const toggleTypeDiffusion = () => toggleType("diffusionParams");

    const toggleTypeFile = () => toggleType("fileName");

    const toggleTypeFolder = () => toggleType("folderName");

    const inputProps: Partial<InputProps> = {
      className: css.input,
      disabled,
      hasHelper: true,
      InputLabelProps: { shrink: true },
    };

    return (
      <View row spacing="0.5rem" className={css.regExRow}>
        <View row spacing="0.5rem">
          <Button
            icon="AccountTree"
            iconSize="1.8em"
            onClick={generateRegEx}
            disabled={disabled}
            tooltip="Generate RegEx from Label and Aliases"
          />
        </View>

        <Input
          {...inputProps}
          label="RegExp"
          value={regEx}
          setValue={setRegEx}
          error={!isRegExValid}
          helperText={!isRegExValid ? "Invalid RegExp" : null}
          fullWidth
          InputProps={{
            endAdornment: <InputAdornment position="end">{"/"}</InputAdornment>,
            startAdornment: <InputAdornment position="start">{"/"}</InputAdornment>,
          }}
        />

        <Input
          {...inputProps}
          label="Test String"
          value={testString}
          setValue={setTestString}
          error={!isTestStringValid}
          helperText={!isTestStringValid ? "Does not match RegExp" : null}
        />

        <View row spacing="0.5rem">
          <Button
            icon="InsertDriveFile"
            iconSize="1.8em"
            tooltip="File Name"
            onClick={toggleTypeFile}
            disabled={disabled}
            color={types.includes("fileName") ? colors.button.blue : colors.button.grey}
          />

          <Button
            icon="Folder"
            iconSize="1.8em"
            tooltip="Folder Name"
            onClick={toggleTypeFolder}
            disabled={disabled}
            color={types.includes("folderName") ? colors.button.blue : colors.button.grey}
          />

          <Button
            icon="TextSnippet"
            iconSize="1.8em"
            tooltip="Diffusion Parameters"
            onClick={toggleTypeDiffusion}
            disabled={disabled}
            color={types.includes("diffusionParams") ? colors.button.blue : colors.button.grey}
          />
        </View>
      </View>
    );
  }
);

const useClasses = makeClasses({
  input: {
    minWidth: "12rem",
  },
  regExRow: {
    flex: 1,
    alignItems: "flex-start",
    borderRadius: "0.5rem",
    padding: "1.2rem 1rem 0.4rem",
    backgroundColor: colors.grey["800"],
    overflow: "auto",
  },
});
