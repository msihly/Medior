export const CUSTOM_EVENTS: {
  args?: string;
  name: string;
}[] = [
  { name: "onFileCollectionsDeleted", args: "{ ids: string[] }" },
  { name: "onFilesArchived", args: "{ fileIds: string[] }" },
  { name: "onFilesDeleted", args: "{ fileHashes: string[]; fileIds: string[] }" },
  { name: "onFilesUpdated", args: "{ fileIds: string[]; updates: Partial<models.FileSchema> }" },
  { name: "onFileImportStarted", args: "{ filePath: string }" },
  {
    name: "onFileImportUpdated",
    args: "{ batchId: string; errorMsg?: string; fileId?: string; filePath: string; status?: Types.ImportStatus }",
  },
  {
    name: "onFileTagsUpdated",
    args: "{ addedTagIds: string[]; batchId?: string; fileIds?: string[]; removedTagIds: string[] }",
  },
  { name: "onImportBatchCompleted", args: "{ id: string }" },
  { name: "onImportBatchLoaded", args: "{ id: string }" },
  { name: "onImporterStatusUpdated" },
  { name: "onReloadFileCollections" },
  { name: "onReloadFiles" },
  { name: "onReloadImportBatches" },
  { name: "onReloadRegExMaps" },
  { name: "onReloadTags" },
  { name: "onTagMerged", args: "{ oldTagId: string; newTagId: string }" },
  {
    name: "onTagsUpdated",
    args: "{ tags: Array<{ tagId: string; updates: Partial<models.TagSchema> }>; withFileReload: boolean }",
  },
];
