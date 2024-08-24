import { MODEL_DEFS } from "./models";

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

  return `/* ------------------------------------ Socket Definitions ----------------------------------- */
    export type SocketEventOptions = { contentId: string; tabId: number };

    export interface SocketEmitEvents { ${socketEmitEvents} }

    export type SocketEmitEvent = keyof SocketEmitEvents;

    export const socketEvents: SocketEmitEvent[] = ["${socketEvents.join('", "')}"];`;
};

/* -------------------------------------------------------------------------- */
/*                                  FILE DEFS                                 */
/* -------------------------------------------------------------------------- */
export const FILE_DEF_SOCKETS: FileDef = {
  name: "socket",
  makeFile: async () => {
    return `import { ${MODEL_DEFS.map((def) => `${def.name}Schema`).join(", ")} } from "medior/database";\n
      ${makeSocketDefs()}`;
  },
};
