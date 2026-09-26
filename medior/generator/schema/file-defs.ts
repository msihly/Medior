import { makeModelDef } from "medior/generator/schema/generators";
import { MODEL_DEFS } from "medior/generator/schema/models";

export const FILE_DEF_MODELS: FileDef = {
  name: "models",

  makeFile: async () => {
    return `import { model, Schema } from "mongoose";
    import { mediaPathPlugin } from "medior/server/database/media-paths";
    import { backgroundExecutionPlugin } from "medior/server/database/database-context";
    import { mediaAncestryPlugin, tagAncestryPlugin } from "medior/server/database/tag-ancestry";
    import { IconName } from "medior/components"
    import { CssColor } from "medior/utils/client";
    \n${MODEL_DEFS.map(makeModelDef).join("\n\n")}`;
  },
};
