import { FILE_DEF_ACTIONS, FILE_DEF_ENDPOINTS, FILE_DEF_TYPES } from "generator/actions/file-defs";
import { FILE_DEF_MODELS } from "generator/schema/file-defs";
import { FILE_DEF_SOCKETS } from "generator/sockets/file-defs";
import { FILE_DEF_SORT_OPTIONS, FILE_DEF_STORES } from "generator/stores/file-defs";

export const CLIENT_FILE_DEFS: FileDef[] = [FILE_DEF_SORT_OPTIONS, FILE_DEF_STORES];

export const SERVER_FILE_DEFS: FileDef[] = [
  FILE_DEF_ACTIONS,
  FILE_DEF_ENDPOINTS,
  FILE_DEF_MODELS,
  FILE_DEF_SOCKETS,
  FILE_DEF_TYPES,
];
