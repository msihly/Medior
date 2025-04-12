import { MODEL_DEFS } from "medior/generator/schema/models";
import { CUSTOM_EVENTS } from "medior/generator/sockets/events";
import { makeSectionComment } from "medior/generator/utils";

export const makeSocketDefs = () => {
  let socketEmitEvents = "";
  let socketEvents: string[] = [];

  MODEL_DEFS.forEach((modelDef) => {
    const schemaName = `models.${modelDef.name}Schema`;

    const events = {
      created: `on${modelDef.name}Created`,
      deleted: `on${modelDef.name}Deleted`,
      updated: `on${modelDef.name}Updated`,
    };

    socketEmitEvents += `${events.created}: (args: ${schemaName}, options?: SocketEventOptions) => void;
      ${events.deleted}: (args: { ids: string[] }, options?: SocketEventOptions) => void;
      ${events.updated}: (args: { id: string; updates: Partial<${schemaName}> }, options?: SocketEventOptions) => void;`;

    socketEvents.push(events.created, events.deleted, events.updated);
  });

  CUSTOM_EVENTS.forEach((event) => {
    socketEmitEvents += `${event.name}: (${event.args ? `args: ${event.args},` : ""} options?: SocketEventOptions) => void;`;
    socketEvents.push(event.name);
  });

  const makeSocketEventOptionsType = () =>
    `export type SocketEventOptions = { contentId: string; tabId: number };`;

  const makeSocketEventTypes = () =>
    `export interface SocketEmitEvents { ${socketEmitEvents} }\n
    export type SocketEmitEvent = keyof SocketEmitEvents;\n
    export interface SocketEvents extends SocketEmitEvents { connected: () => void; }`;

  const makeSocketEvents = () =>
    `export const socketEvents: SocketEmitEvent[] = ["${socketEvents.join('", "')}"];`;

  return `${makeSectionComment("Socket Definitions")}\n
    ${makeSocketEventOptionsType()}\n
    ${makeSocketEventTypes()}\n
    ${makeSocketEvents()}`;
};
