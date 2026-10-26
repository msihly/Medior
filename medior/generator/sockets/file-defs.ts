import { MODEL_DEFS } from "medior/generator/schema/models";
import { CUSTOM_EVENTS } from "medior/generator/sockets/events";
import { makeSocketDefs } from "medior/generator/utils";

export const FILE_DEF_SOCKETS: FileDef = {
  name: "socket",
  makeFile: async () => {
    const modelNames = MODEL_DEFS.filter((def) => def.withActions !== false).map((def) => def.name);

    const makeImports = () =>
      `import * as models from "medior/_generated/server/models";
      import * as Types from "medior/server/database/types";`;

    return `${makeImports()}\n${makeSocketDefs({ customEvents: CUSTOM_EVENTS, modelNames })}`;
  },
};
