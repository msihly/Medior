import { useMemo } from "react";
import { InputAdornment } from "@mui/material";
import { Button, Comp, Input, InputProps, View } from "medior/components";
import { TagEditorStore, useStores } from "medior/store";
import { colors, makeClasses } from "medior/utils/client";

export interface RegExMapRowProps {
  disabled?: boolean;
  store: TagEditorStore;
}

export const RegExMapRow = Comp(({ disabled = false, store }: RegExMapRowProps) => {
  const { css } = useClasses(null);

  const stores = useStores();

  const [isRegExValid, isTestStringValid] = useMemo(() => {
    try {
      return [
        true,
        store.regExTestString.length > 0
          ? new RegExp(store.regExValue, "im").test(store.regExTestString)
          : true,
      ];
    } catch (error) {
      return [false, false];
    }
  }, [store.regExValue, store.regExTestString]);

  const generateRegEx = () =>
    store.setRegExValue(stores.tag.tagsToRegEx([{ aliases: store.aliases, label: store.label }]));

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
        value={store.regExValue}
        setValue={store.setRegExValue}
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

        <Input
          {...inputProps}
          header="Test String"
          value={store.regExTestString}
          setValue={store.setRegExTestString}
          error={!isTestStringValid}
          helperText={!isTestStringValid ? "Does not match RegExp" : null}
          width="100%"
        />
      </View>
    </View>
  );
});

const useClasses = makeClasses({
  input: {
    minWidth: "12rem",
  },
});
