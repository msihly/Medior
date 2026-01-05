import { useMemo } from "react";
import { InputAdornment } from "@mui/material";
import { Button, Card, Comp, Input, View } from "medior/components";
import { TagEditorStore, useStores } from "medior/store";
import { colors } from "medior/utils/client";

export interface RegExMapCardProps {
  disabled?: boolean;
  store: TagEditorStore;
}

export const RegExMapCard = Comp(({ disabled = false, store }: RegExMapCardProps) => {
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

  return (
    <Card column header="Regular Expression">
      <View row>
        <Button
          icon="AccountTree"
          iconSize="1.8em"
          onClick={generateRegEx}
          disabled={disabled}
          tooltip="Generate RegEx from Label and Aliases"
          color={colors.custom.black}
          borderRadiuses={{ right: 0, bottom: 0 }}
        />

        <Input
          placeholder="Enter RegEx..."
          value={store.regExValue}
          setValue={store.setRegExValue}
          disabled={disabled}
          error={!isRegExValid}
          width="100%"
          InputProps={{
            endAdornment: <InputAdornment position="end">{"/"}</InputAdornment>,
            startAdornment: <InputAdornment position="start">{"/"}</InputAdornment>,
          }}
          borderRadiuses={{ left: 0 }}
        />
      </View>

      <Input
        placeholder="Enter test string..."
        value={store.regExTestString}
        setValue={store.setRegExTestString}
        disabled={disabled}
        error={!isTestStringValid}
        hasHelper
        helperText={!isTestStringValid ? "Does not match RegExp" : null}
        multiline
        rows={2}
        width="100%"
        borderRadiuses={{ topLeft: 0 }}
      />
    </Card>
  );
});
