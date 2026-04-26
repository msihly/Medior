import { makeSocketDefs } from "medior/generator/sockets/generators";

export const FILE_DEF_SOCKETS: FileDef = {
  name: "socket",
  makeFile: async () => {
    const makeImports = () =>
      `import * as models from "medior/_generated/server/models";
      import * as Types from "medior/server/database/types";`;

    return `${makeImports()}\n${makeSocketDefs()}`;
  },
};
