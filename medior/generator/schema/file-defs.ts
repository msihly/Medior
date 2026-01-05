import { makeModelDef } from "medior/generator/schema/generators";
import { MODEL_DEFS } from "medior/generator/schema/models";

export const FILE_DEF_MODELS: FileDef = {
  name: "models",
  makeFile: async () => {
    return `import { model, Schema } from "mongoose";
    import { IconName } from "medior/components";
    \n${MODEL_DEFS.map(makeModelDef).join("\n\n")}`;
  },
};
