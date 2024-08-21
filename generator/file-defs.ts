import { capitalize } from "medior/utils";
import {
  getActions,
  makeActionsDef,
  makeCustomActionTypes,
  makeEndpointDefFromCustomAction,
  makeEndpointDefFromModelName,
  makeModelActionTypes,
} from "./actions";
import { MODEL_DEFS, makeModelDef, makeSortDef } from "./models";
import { makeSocketDefs } from "./sockets";
import { makeStoreDef } from "./stores";

export const fileDefs: FileDef[] = [
  {
    name: "actions",
    makeFile: async () => {
      let output = `import * as db from ".";
        import { leanModelToJson, makeAction } from "medior/database/utils";
        import { dayjs, socket } from "medior/utils";\n`;

      for (const def of MODEL_DEFS) {
        output += `${await makeActionsDef(def)}\n\n`;
      }

      return output;
    },
  },
  {
    name: "endpoints",
    makeFile: async () => {
      const actions = await getActions();

      return `import { initTRPC } from "@trpc/server";
        import * as db from "medior/database";
        import * as actions from "./actions";

        export const trpc = initTRPC.create();

        /** All resources defined as mutation to deal with max length URLs in GET requests.
         *  @see https://github.com/trpc/trpc/discussions/1936
         */
        export const serverEndpoint = <Input, Output>(fn: (input: Input) => Promise<Output>) =>
          trpc.procedure.input((input: Input) => input).mutation(({ input }) => fn(input));

        export const serverRouter = trpc.router({
          /** Model actions */
          ${MODEL_DEFS.map((d) => makeEndpointDefFromModelName(d.name, actions.model)).join(",")},
          /** Custom actions */
          ${actions.custom.map(makeEndpointDefFromCustomAction).join(",")}
        });`;
    },
  },
  {
    name: "models",
    makeFile: async () => {
      return `import { model, Schema } from "mongoose";\n
        ${MODEL_DEFS.map(makeModelDef).join("\n\n")}`;
    },
  },
  {
    name: "socket",
    makeFile: async () => {
      return `import { ${MODEL_DEFS.map((def) => `${def.name}Schema`).join(", ")} } from "medior/database";\n
        ${makeSocketDefs()}`;
    },
  },
  {
    name: "sort-options",
    makeFile: async () => {
      return `import { IconName } from "medior/components/media/icon";\n
      export interface SortOption {
        attribute: string;
        icon: IconName;
        label: string;
      }\n
      export interface SortValue {
        isDesc: boolean;
        key: string;
      }\n
      export const SORT_OPTIONS: Record<${MODEL_DEFS.map((m) => `"${m.name}"`).join(" | ")}, SortOption[]> = {
        ${MODEL_DEFS.map(makeSortDef)}
      };`;
    },
  },
  {
    name: "types",
    makeFile: async () => {
      const actions = await getActions();

      return `import * as db from "medior/database";
        import { FilterQuery, SortOrder } from "mongoose";

        /* -------------------------------------------------------------------------- */
        /*                                MODEL ACTIONS                               */
        /* -------------------------------------------------------------------------- */
        ${MODEL_DEFS.map((def) =>
          makeModelActionTypes(
            def.name,
            actions.model.map((a) => `${capitalize(a)}Input`)
          )
        ).join("\n\n")}

        /* -------------------------------------------------------------------------- */
        /*                               CUSTOM ACTIONS                               */
        /* -------------------------------------------------------------------------- */
        ${makeCustomActionTypes(actions.custom)}\n`;
    },
  },
];

export const storeFileDefs: FileDef[] = [
  {
    name: "stores",
    makeFile: async () => {
      const storeImports = [
        ...MODEL_DEFS.filter((m) => m.withStore).map((m) => m.name),
        ...MODEL_DEFS.flatMap((d) => d.properties)
          .filter((p) => p.withStore)
          .map((p) => p.schemaToStoreName),
      ].join(", ");

      let output = `import { applySnapshot, getSnapshot, Model, model, modelAction, ModelCreationData, modelFlow, prop } from "mobx-keystone";
      import * as db from "medior/database";
      import { SortValue } from "medior/_generated";
      import { ${storeImports} } from "medior/store";
      import { asyncAction } from "medior/store/utils";
      import { dayjs, trpc } from "medior/utils";\n`;

      for (const def of MODEL_DEFS) {
        output += `${await makeStoreDef(def)}\n\n`;
      }

      return output;
    },
  },
];
