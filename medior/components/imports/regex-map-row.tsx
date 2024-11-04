import { useMemo } from "react";
import { TagSchema } from "medior/database";
import { Tag, observer, useStores } from "medior/store";
import { InputAdornment } from "@mui/material";
import { Button, Input, InputProps, View } from "medior/components";
import { colors, makeClasses } from "medior/utils";

export interface RegExMapRowProps {
  aliases: Tag["aliases"];
  disabled?: boolean;
  label: Tag["label"];
  regEx: string;
  setRegEx: (regEx: string) => void;
  setTestString: (testString: string) => void;
  setTypes: (types: TagSchema["regExMap"]["types"]) => void;
  testString: string;
  types: TagSchema["regExMap"]["types"];
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

    const toggleType = (type: TagSchema["regExMap"]["types"][number]) =>
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
      <View column>
        <Input
          {...inputProps}
          header="RegExp"
          value={regEx}
          setValue={setRegEx}
          error={!isRegExValid}
          helperText={!isRegExValid ? "Invalid RegExp" : null}
          width="100%"
          InputProps={{
            endAdornment: <InputAdornment position="end">{"/"}</InputAdornment>,
            startAdornment: <InputAdornment position="start">{"/"}</InputAdornment>,
          }}
        />

        <View row align="center" spacing="0.5rem">
          <Button
            icon="AccountTree"
            iconSize="1.8em"
            onClick={generateRegEx}
            disabled={disabled}
            color={colors.custom.purple}
            tooltip="Generate RegEx from Label and Aliases"
          />

          <Button
            icon="InsertDriveFile"
            iconSize="1.8em"
            tooltip="File Name"
            onClick={toggleTypeFile}
            disabled={disabled}
            color={types.includes("fileName") ? colors.custom.green : colors.custom.grey}
          />

          <Button
            icon="Folder"
            iconSize="1.8em"
            tooltip="Folder Name"
            onClick={toggleTypeFolder}
            disabled={disabled}
            color={types.includes("folderName") ? colors.custom.green : colors.custom.grey}
          />

          <Button
            icon="TextSnippet"
            iconSize="1.8em"
            tooltip="Diffusion Parameters"
            onClick={toggleTypeDiffusion}
            disabled={disabled}
            color={types.includes("diffusionParams") ? colors.custom.green : colors.custom.grey}
          />

          <Input
            {...inputProps}
            header="Test String"
            value={testString}
            setValue={setTestString}
            error={!isTestStringValid}
            helperText={!isTestStringValid ? "Does not match RegExp" : null}
            width="100%"
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
});
