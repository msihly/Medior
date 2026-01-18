import path from "path";
import { getLigaturesFromPath } from "ligatures";
import { Fmt } from "medior/utils/common";

export const FILE_DEF_ICONS: FileDef = {
  name: "icons",
  makeFile: async () => {
    const fontPath = path.resolve("medior/css/fonts/material-icons-round.woff2");
    const iconNames = [...new Set(await getLigaturesFromPath(fontPath))]
      .map(Fmt.snakeToPascal)
      .sort();

    return `export const MUI_ICONS = [${iconNames.map((name) => `"${name}"`).join(",\n")}] as const;\n
      export type IconName = typeof MUI_ICONS[number];`;
  },
};
