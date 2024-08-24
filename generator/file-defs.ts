import { FILE_DEF_ACTIONS, FILE_DEF_ENDPOINTS, FILE_DEF_TYPES } from "./actions";
import { FILE_DEF_MODELS } from "./models";
import { FILE_DEF_SOCKETS } from "./sockets";
import { FILE_DEF_SORT_OPTIONS, FILE_DEF_STORES } from "./stores";

export const fileDefs: FileDef[] = [
  FILE_DEF_ACTIONS,
  FILE_DEF_ENDPOINTS,
  FILE_DEF_MODELS,
  FILE_DEF_SOCKETS,
  FILE_DEF_TYPES,
];

export const storeFileDefs: FileDef[] = [FILE_DEF_SORT_OPTIONS, FILE_DEF_STORES];
