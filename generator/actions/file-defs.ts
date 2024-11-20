import {
  getActions,
  makeActionsDef,
  makeCustomActionTypes,
  makeFilterQueryType,
  makeModelActionTypes,
  makeSearchActionsDef,
  makeServerRouter,
} from "generator/actions/generators";
import { MODEL_DEFS } from "generator/schema/models";
import { MODEL_SEARCH_STORE_DEFS } from "generator/stores/models";
import { capitalize, makeSectionComment } from "generator/utils";

export const FILE_DEF_ACTIONS: FileDef = {
  name: "actions",
  makeFile: async () => {
    const actions = await getActions();

    const makeImports = () =>
      `import { FilterQuery } from "mongoose";
      import { SocketEventOptions } from "medior/_generated/socket";
      import * as models from "medior/_generated/models";
      import * as Types from "medior/database/types";
      import { getShiftSelectedItems, leanModelToJson, makeAction, objectIds } from "medior/database/utils";
      import { SortMenuProps } from "medior/components";
      import { dayjs, isDeepEqual, LogicalOp, logicOpsToMongo, setObj, socket } from "medior/utils";`;

    const makeModelActions = async () => {
      const defs: string[] = [];
      for (const def of MODEL_DEFS) defs.push(await makeActionsDef(def, actions));
      return defs.join("\n");
    };

    const makeSearchActions = async () => {
      const defs: string[] = [];
      for (const def of MODEL_SEARCH_STORE_DEFS)
        defs.push(await makeSearchActionsDef(def, actions));
      return defs.join("\n");
    };

    return `${makeImports()}\n
      ${makeSectionComment("SEARCH ACTIONS")}\n
      ${await makeSearchActions()}\n
      ${makeSectionComment("MODEL ACTIONS")}\n
      ${await makeModelActions()}\n`;
  },
};

export const FILE_DEF_ENDPOINTS: FileDef = {
  name: "endpoints",
  makeFile: async () => {
    const makeImports = () =>
      `import { initTRPC } from "@trpc/server";
      import * as db from "medior/database/actions";`;

    return `${makeImports()}\n${await makeServerRouter()}`;
  },
};

export const FILE_DEF_TYPES: FileDef = {
  name: "types",
  makeFile: async () => {
    const actions = await getActions();

    const makeImports = () =>
      `import * as db from "medior/database";
      import { QuerySelector, SortOrder } from "mongoose";`;

    const makeCustomActions = () => makeCustomActionTypes(actions.custom);

    const makeModelActions = () =>
      MODEL_DEFS.map((def) =>
        makeModelActionTypes(
          def.name,
          actions.model.map((a) => `${capitalize(a)}Input`)
        )
      ).join("\n\n");

    return `${makeImports()}\n
      ${makeFilterQueryType()}\n
      ${makeSectionComment("MODEL ACTIONS")}
      ${makeModelActions()}\n
      ${makeSectionComment("CUSTOM ACTIONS")}
      ${makeCustomActions()}`;
  },
};
