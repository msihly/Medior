import { MODEL_DEFS } from "./models";

/* -------------------------------------------------------------------------- */
/*                                CUSTOM EVENTS                               */
/* -------------------------------------------------------------------------- */
const CUSTOM_EVENTS: {
  args?: string;
  name: string;
}[] = [
  { name: "onFilesArchived", args: "{ fileIds: string[] }" },
  { name: "onFilesDeleted", args: "{ fileHashes: string[]; fileIds: string[] }" },
  { name: "onFilesUpdated", args: "{ fileIds: string[]; updates: Partial<FileSchema> }" },
  {
    name: "onFileTagsUpdated",
    args: "{ addedTagIds: string[]; batchId?: string; fileIds?: string[]; removedTagIds: string[] }",
  },
  { name: "onImportBatchCompleted", args: "{ id: string }" },
  { name: "onImportStatsUpdated", args: "{ importStats: Types.ImportStats }" },
  { name: "onReloadFileCollections" },
  { name: "onReloadFiles" },
  { name: "onReloadImportBatches" },
  { name: "onReloadRegExMaps" },
  { name: "onReloadTags" },
  { name: "onTagMerged", args: "{ oldTagId: string; newTagId: string }" },
  {
    name: "onTagsUpdated",
    args: "{ tags: Array<{ tagId: string; updates: Partial<TagSchema> }>; withFileReload: boolean }",
  },
];

/* -------------------------------------------------------------------------- */
/*                             GENERATOR FUNCTIONS                            */
/* -------------------------------------------------------------------------- */
const makeSocketDefs = () => {
  let socketEmitEvents = "";
  let socketEvents: string[] = [];

  MODEL_DEFS.forEach((modelDef) => {
    const events = {
      created: `on${modelDef.name}Created`,
      deleted: `on${modelDef.name}Deleted`,
      updated: `on${modelDef.name}Updated`,
    };

    const schemaName = `${modelDef.name}Schema`;

    socketEmitEvents += `${events.created}: (args: ${schemaName}, options?: SocketEventOptions) => void;
      ${events.deleted}: (args: { id: string }, options?: SocketEventOptions) => void;
      ${events.updated}: (args: { id: string; updates: Partial<${schemaName}> }, options?: SocketEventOptions) => void;`;

    socketEvents.push(events.created, events.deleted, events.updated);
  });

  CUSTOM_EVENTS.forEach((event) => {
    socketEmitEvents += `${event.name}: (${event.args ? `args: ${event.args},` : ""} options?: SocketEventOptions) => void;`;
    socketEvents.push(event.name);
  });

  return `/* ------------------------------------ Socket Definitions ----------------------------------- */
    export type SocketEventOptions = { contentId: string; tabId: number };

    export interface SocketEmitEvents { ${socketEmitEvents} }

    export type SocketEmitEvent = keyof SocketEmitEvents;

    export interface SocketEvents extends SocketEmitEvents {
      connected: () => void;
    }

    export const socketEvents: SocketEmitEvent[] = ["${socketEvents.join('", "')}"];`;
};

/* -------------------------------------------------------------------------- */
/*                                  FILE DEFS                                 */
/* -------------------------------------------------------------------------- */
export const FILE_DEF_SOCKETS: FileDef = {
  name: "socket",
  makeFile: async () => {
    return `import * as Types from "medior/database/types";
      import { ${MODEL_DEFS.map((def) => `${def.name}Schema`).join(", ")} } from "medior/_generated/models";\n
      ${makeSocketDefs()}`;
  },
};
