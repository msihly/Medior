import { capitalize } from "medior/utils";
import {
  FILE_DEF_ACTIONS,
  FILE_DEF_ENDPOINTS,
  getActions,
  makeCustomActionTypes,
  makeModelActionTypes,
} from "./actions";
import { MODEL_DEFS, makeModelDef, makeSortDef } from "./models";
import { makeSocketDefs } from "./sockets";
import { makeStoreDef } from "./stores";

export const fileDefs: FileDef[] = [
  FILE_DEF_ACTIONS,
  FILE_DEF_ENDPOINTS,
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
        import { QuerySelector, SortOrder } from "mongoose";

        export type _FilterQuery<Schema> = {
          [SchemaKey in keyof Schema]?:
            | Schema[SchemaKey]
            | Array<Schema[SchemaKey]>
            | QuerySelector<Schema[SchemaKey]>;
        } & {
          _id?: string | Array<string> | QuerySelector<string>;
          $and?: Array<_FilterQuery<Schema>>;
          $nor?: Array<_FilterQuery<Schema>>;
          $or?: Array<_FilterQuery<Schema>>;
          $text?: {
            $search: string;
            $language?: string;
            $caseSensitive?: boolean;
            $diacriticSensitive?: boolean;
          };
          $where?: string | Function;
          $comment?: string;
        };

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
