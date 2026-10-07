import { makeModelDef } from "medior/generator/schema/generators";
import { MODEL_DEFS } from "medior/generator/schema/models";

export const FILE_DEF_MODELS: FileDef = {
  name: "models",

  makeFile: async () => {
    return `import { model, Schema } from "mongoose";
    import { IconName } from "medior/components";
    import { backgroundExecutionPlugin } from "medior/server/database/database-context";
    import { importEntriesPlugin } from "medior/server/database/import-entry-state";
    import { mediaPathPlugin } from "medior/server/database/media-paths";
    import { registerPersistenceModel } from "medior/server/database/persistence";
    import { mediaAncestryPlugin, tagAncestryPlugin } from "medior/server/database/tag-ancestry";
    import { CssColor } from "medior/utils/client";
    \n${MODEL_DEFS.map(makeModelDef).join("\n\n")}`;
  },
};
