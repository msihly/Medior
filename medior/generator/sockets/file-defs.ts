import { makeSocketDefs } from "medior/generator/sockets/generators";

export const FILE_DEF_SOCKETS: FileDef = {
  name: "socket",
  makeFile: async () => {
    const makeImports = () =>
      `import * as Types from "medior/server/database/types";
      import * as models from "medior/_generated/models";`;

    return `${makeImports()}\n${makeSocketDefs()}`;
  },
};
