import type {
  FileImportBatchSchema,
  FileImportSchema,
  FileSchema,
} from "medior/_generated/server/models";

export const IMPORT_PAGE_SIZE = 100;
export const IMPORT_UPLOAD_BYTES = 4 * 1024 * 1024;
export const IMPORT_UPLOAD_COUNT = 1000;

export const FILE_SIDECAR_FIELDS = [
  "collections",
  "dateCreated",
  "diffusionParams",
  "isArchived",
  "originalName",
  "rating",
  "tagIds",
  "timestamps",
  "transcription",
] as const;

export type FileSidecarField = (typeof FILE_SIDECAR_FIELDS)[number];

/** Sidecar tag ids are merged into the import entry's own tag ids. */
export const FILE_IMPORT_SIDECAR_FIELDS = FILE_SIDECAR_FIELDS.filter(
  (field): field is Exclude<FileSidecarField, "tagIds"> => field !== "tagIds",
);

export type FileImportSidecarField = (typeof FILE_IMPORT_SIDECAR_FIELDS)[number];

export type FileImportSidecar = NonNullable<FileImportSchema["sidecar"]>;

export type FileSidecar = FileImportSidecar & Partial<Pick<FileSchema, "tagIds">>;

export type FileSidecarCollection = FileImportSidecar["collections"][number];

export type ImportEntryInput = Pick<
  FileImportSchema,
  | "dateCreated"
  | "diffusionParams"
  | "extension"
  | "name"
  | "path"
  | "sidecar"
  | "size"
  | "subtitles"
  | "tagIds"
>;

export type ImportBatchOptions = Pick<
  FileImportBatchSchema,
  | "collectionSourceFolderPath"
  | "collectionTitle"
  | "deleteOnImport"
  | "ignorePrevDeleted"
  | "mediaProgram"
  | "rootFolderPath"
  | "subtitleMode"
> & { tagIds?: string[] };

export type ImportBatchInput = ImportBatchOptions & { imports: ImportEntryInput[] };
