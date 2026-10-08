import { Card, Comp } from "medior/components";
import { colors } from "medior/utils/client";
import { ConfigKey } from "medior/utils/server";
import { ExtCheckbox } from "./ext-checkbox";

export interface ExtColumnProps {
  configKey: ConfigKey;
  label: string;
  options: string[];
}

export const ExtColumn = Comp(({ configKey, label, options }: ExtColumnProps) => {
  return (
    <Card column header={label} bgColor={colors.foregroundCard} overflow="hidden auto">
      {options.map((ext) => (
        <ExtCheckbox key={ext} ext={ext} configKey={configKey} />
      ))}
    </Card>
  );
});
