import {
  FILE_DEF_ACTIONS,
  FILE_DEF_ENDPOINTS,
  FILE_DEF_TYPES,
} from "medior/generator/actions/file-defs";
import { FILE_DEF_ICONS } from "medior/generator/icons/file-defs";
import { FILE_DEF_MODELS } from "medior/generator/schema/file-defs";
import { FILE_DEF_SOCKETS } from "medior/generator/sockets/file-defs";
import { FILE_DEF_SORT_OPTIONS, FILE_DEF_STORES } from "medior/generator/stores/file-defs";

export const CLIENT_FILE_DEFS: FileDef[] = [FILE_DEF_ICONS];

export const STORE_FILE_DEFS: FileDef[] = [FILE_DEF_SORT_OPTIONS, FILE_DEF_STORES];

export const SERVER_FILE_DEFS: FileDef[] = [
  FILE_DEF_ACTIONS,
  FILE_DEF_ENDPOINTS,
  FILE_DEF_MODELS,
  FILE_DEF_SOCKETS,
  FILE_DEF_TYPES,
];
