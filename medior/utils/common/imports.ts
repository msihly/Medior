import type { FileImportBatchSchema, FileImportSchema } from "medior/_generated/server/models";

export const IMPORT_PAGE_SIZE = 100;
export const IMPORT_UPLOAD_BYTES = 4 * 1024 * 1024;
export const IMPORT_UPLOAD_COUNT = 1000;

export type ImportEntryInput = Pick<
  FileImportSchema,
  "dateCreated" | "diffusionParams" | "extension" | "name" | "path" | "size" | "tagIds"
>;

export type ImportBatchOptions = Pick<
  FileImportBatchSchema,
  | "collectionSourceFolderPath"
  | "collectionTitle"
  | "deleteOnImport"
  | "ignorePrevDeleted"
  | "rootFolderPath"
> & { tagIds?: string[] };

export type ImportBatchInput = ImportBatchOptions & { imports: ImportEntryInput[] };
