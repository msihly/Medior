export const CUSTOM_EVENTS: {
  args?: string;
  name: string;
}[] = [
  {
    args: "{ batchId: string; completed: number; failed: number; isRegenerating: boolean }",
    name: "onDuplicateMergeProgress",
  },
  { args: "{ ids: string[] }", name: "onFileCollectionsDeleted" },
  {
    args: "{ batchId?: string; elapsed: number; filePath: string; message: string; progress?: number }",
    name: "onFileImportProgress",
  },
  { args: "{ filePath: string }", name: "onFileImportStarted" },
  {
    args: "{ batchId: string; errorMsg?: string; fileId?: string; filePath: string; processedCount: number; processedSize: number; progressRevision: number; status?: Types.ImportStatus }",
    name: "onFileImportUpdated",
  },
  {
    args: "{ fileId: string; fileName: string; message: string; progress?: number; refreshId: string }",
    name: "onFileRefreshProgress",
  },
  { args: "{ fileIds: string[] }", name: "onFilesArchived" },
  { args: "{ fileHashes: string[]; fileIds: string[] }", name: "onFilesDeleted" },
  { args: "{ fileIds: string[]; updates: Partial<models.FileSchema> }", name: "onFilesUpdated" },
  {
    args: "{ addedTagIds: string[]; batchId?: string; fileIds?: string[]; removedTagIds: string[] }",
    name: "onFileTagsUpdated",
  },
  {
    args: "{ file: models.FileSchema; transform: models.FileTransformSchema }",
    name: "onFileTransformLoaded",
  },
  { name: "onFileTransformerStatusUpdated" },
  { args: "{ id: string }", name: "onImportBatchCompleted" },
  { args: "{ id: string }", name: "onImportBatchLoaded" },
  { name: "onImporterStatusUpdated" },
  { args: "{ ids: string[] }", name: "onNotificationsRead" },
  { name: "onReloadBackgroundActivity" },
  { name: "onReloadFileCollections" },
  { args: "{ reason: 'created' | 'reset' }", name: "onReloadFileTransforms" },
  { name: "onReloadFiles" },
  { name: "onReloadImportBatches" },
  { name: "onReloadRegExMaps" },
  { name: "onReloadTags" },
  {
    args: "{ message: string; repairId: string; status: 'cancelled' | 'error' | 'info' | 'progress' | 'success' }",
    name: "onRepairProgress",
  },
  { args: "{ newTagId: string; oldTagId: string }", name: "onTagMerged" },
  {
    args: "{ tags: Array<{ tagId: string; updates: Partial<models.TagSchema> }>; withFileReload: boolean }",
    name: "onTagsUpdated",
  },
];
