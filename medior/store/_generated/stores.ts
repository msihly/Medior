/* -------------------------------------------------------------------------- */
/*                    THIS IS A GENERATED FILE. DO NOT EDIT.                  */
/* -------------------------------------------------------------------------- */

import {
  applySnapshot,
  getSnapshot,
  Model,
  model,
  modelAction,
  ModelCreationData,
  modelFlow,
  prop,
} from "mobx-keystone";
import * as db from "medior/database";
import { SortValue } from "medior/store/_generated/sort-options";
import { FileCollection, FileImportBatch, File, Tag, FileImport } from "medior/store";
import { asyncAction } from "medior/store/utils";
import { dayjs, trpc } from "medior/utils";
/* --------------------------------------------------------------------------- */
/*                               DeletedFile
/* --------------------------------------------------------------------------- */
@model("medior/_DeletedFile")
export class _DeletedFile extends Model({
  dateCreated: prop<string>(() => dayjs().toISOString()),
  id: prop<string>(),
  hash: prop<string>(),
}) {
  @modelAction
  update(updates: Partial<ModelCreationData<this>>) {
    applySnapshot(this, { ...getSnapshot(this), ...updates });
  }
}

@model("medior/_DeletedFileStore")
export class _DeletedFileStore extends Model({
  deletedFiles: prop<_DeletedFile[]>(() => []),
  isLoading: prop<boolean>(true).withSetter(),
  page: prop<number>(1).withSetter(),
  pageCount: prop<number>(1).withSetter(),
  pageSize: prop<number>(undefined).withSetter(),
  sortValue: prop<SortValue>(() => ({ isDesc: true, key: "hash" })).withSetter(),
}) {
  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  _addDeletedFile(deletedFile: ModelCreationData<_DeletedFile>) {
    this.deletedFiles.push(new _DeletedFile(deletedFile));
  }

  @modelAction
  _deleteDeletedFile(id: string) {
    this.deletedFiles = this.deletedFiles.filter((d) => d.id !== id);
  }

  @modelAction
  overwriteDeletedFiles(deletedFiles: ModelCreationData<_DeletedFile>[]) {
    this.deletedFiles = deletedFiles.map((d) => new _DeletedFile(d));
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  createDeletedFile = asyncAction(async (args: db.CreateDeletedFileInput) => {
    this.setIsLoading(true);
    const res = await trpc.createDeletedFile.mutate({ args });
    this.setIsLoading(false);
    if (res.error) throw new Error(res.error);
    return res.data;
  });

  @modelFlow
  deleteDeletedFile = asyncAction(async (args: db.DeleteDeletedFileInput) => {
    this.setIsLoading(true);
    const res = await trpc.deleteDeletedFile.mutate({ args });
    this.setIsLoading(false);
    if (res.error) throw new Error(res.error);
    return res.data;
  });

  @modelFlow
  loadDeletedFiles = asyncAction(
    async ({ withOverwrite = true, ...args }: db._ListDeletedFilesInput = {}) => {
      this.setIsLoading(true);
      const res = await trpc._listDeletedFiles.mutate({
        args: {
          filter: JSON.parse(JSON.stringify(args.filter)),
          page: args.page ?? this.page,
          pageSize: args.pageSize ?? this.pageSize,
          sort: args.sort ?? { [this.sortValue.key]: this.sortValue.isDesc ? "desc" : "asc" },
        },
      });
      this.setIsLoading(false);
      if (res.error) throw new Error(res.error);
      if (withOverwrite) {
        this.overwriteDeletedFiles(res.data.items as ModelCreationData<_DeletedFile>[]);
        this.setPageCount(res.data.pageCount);
      }
      return res.data;
    },
  );

  @modelFlow
  updateDeletedFile = asyncAction(async (args: db.UpdateDeletedFileInput) => {
    this.setIsLoading(true);
    const res = await trpc.updateDeletedFile.mutate({ args });
    this.setIsLoading(false);
    if (res.error) throw new Error(res.error);
    return res.data;
  });

  /* ----------------------------- DYNAMIC GETTERS ---------------------------- */
  getDeletedFile(id: string) {
    return this.deletedFiles.find((d) => d.id === id);
  }
}

/* --------------------------------------------------------------------------- */
/*                               FileCollection
/* --------------------------------------------------------------------------- */
@model("medior/_FileCollection")
export class _FileCollection extends Model({
  dateCreated: prop<string>(() => dayjs().toISOString()),
  id: prop<string>(),
  dateModified: prop<string>(null),
  fileCount: prop<number>(0),
  fileIdIndexes: prop<{ fileId: string; index: number }[]>(),
  rating: prop<number>(0),
  tagIds: prop<string[]>(() => []),
  tagIdsWithAncestors: prop<string[]>(() => []),
  thumbPaths: prop<string[]>(() => []),
  title: prop<string>(),
}) {
  @modelAction
  update(updates: Partial<ModelCreationData<this>>) {
    applySnapshot(this, { ...getSnapshot(this), ...updates });
  }
}

@model("medior/_FileCollectionStore")
export class _FileCollectionStore extends Model({
  fileCollections: prop<FileCollection[]>(() => []),
  isLoading: prop<boolean>(true).withSetter(),
  page: prop<number>(1).withSetter(),
  pageCount: prop<number>(1).withSetter(),
  pageSize: prop<number>(50).withSetter(),
  sortValue: prop<SortValue>(() => ({ isDesc: true, key: "dateCreated" })).withSetter(),
}) {
  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  _addFileCollection(fileCollection: ModelCreationData<FileCollection>) {
    this.fileCollections.push(new FileCollection(fileCollection));
  }

  @modelAction
  _deleteFileCollection(id: string) {
    this.fileCollections = this.fileCollections.filter((d) => d.id !== id);
  }

  @modelAction
  overwriteFileCollections(fileCollections: ModelCreationData<FileCollection>[]) {
    this.fileCollections = fileCollections.map((d) => new FileCollection(d));
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  createFileCollection = asyncAction(async (args: db.CreateFileCollectionInput) => {
    this.setIsLoading(true);
    const res = await trpc.createFileCollection.mutate({ args });
    this.setIsLoading(false);
    if (res.error) throw new Error(res.error);
    return res.data;
  });

  @modelFlow
  deleteFileCollection = asyncAction(async (args: db.DeleteFileCollectionInput) => {
    this.setIsLoading(true);
    const res = await trpc.deleteFileCollection.mutate({ args });
    this.setIsLoading(false);
    if (res.error) throw new Error(res.error);
    return res.data;
  });

  @modelFlow
  loadFileCollections = asyncAction(
    async ({ withOverwrite = true, ...args }: db.ListFileCollectionsInput = {}) => {
      this.setIsLoading(true);
      const res = await trpc.listFileCollections.mutate({
        args: {
          filter: JSON.parse(JSON.stringify(args.filter)),
          page: args.page ?? this.page,
          pageSize: args.pageSize ?? this.pageSize,
          sort: args.sort ?? { [this.sortValue.key]: this.sortValue.isDesc ? "desc" : "asc" },
        },
      });
      this.setIsLoading(false);
      if (res.error) throw new Error(res.error);
      if (withOverwrite) {
        this.overwriteFileCollections(res.data.items as ModelCreationData<FileCollection>[]);
        this.setPageCount(res.data.pageCount);
      }
      return res.data;
    },
  );

  @modelFlow
  updateFileCollection = asyncAction(async (args: db.UpdateFileCollectionInput) => {
    this.setIsLoading(true);
    const res = await trpc.updateFileCollection.mutate({ args });
    this.setIsLoading(false);
    if (res.error) throw new Error(res.error);
    return res.data;
  });

  /* ----------------------------- DYNAMIC GETTERS ---------------------------- */
  getFileCollection(id: string) {
    return this.fileCollections.find((d) => d.id === id);
  }
}

/* --------------------------------------------------------------------------- */
/*                               FileImportBatch
/* --------------------------------------------------------------------------- */
@model("medior/_FileImportBatch")
export class _FileImportBatch extends Model({
  dateCreated: prop<string>(() => dayjs().toISOString()),
  id: prop<string>(),
  collectionId: prop<string>(null),
  collectionTitle: prop<string>(null),
  completedAt: prop<string>(),
  deleteOnImport: prop<boolean>(),
  ignorePrevDeleted: prop<boolean>(),
  imports: prop<FileImport[]>(() => []),
  rootFolderPath: prop<string>(),
  startedAt: prop<string>(null),
  tagIds: prop<string[]>(),
}) {
  @modelAction
  update(updates: Partial<ModelCreationData<this>>) {
    applySnapshot(this, { ...getSnapshot(this), ...updates });
  }
}

@model("medior/_FileImport")
export class _FileImport extends Model({
  dateCreated: prop<string>(),
  diffusionParams: prop<string>(null),
  errorMsg: prop<string>(null),
  extension: prop<string>(),
  fileId: prop<string>(null),
  name: prop<string>(),
  path: prop<string>(),
  size: prop<number>(),
  status: prop<string | "COMPLETE" | "DELETED" | "DUPLICATE" | "ERROR" | "PENDING">(),
  tagIds: prop<string[]>(null),
  thumbPaths: prop<string[]>(null),
}) {
  @modelAction
  update(updates: Partial<ModelCreationData<this>>) {
    applySnapshot(this, { ...getSnapshot(this), ...updates });
  }
}

@model("medior/_FileImportBatchStore")
export class _FileImportBatchStore extends Model({
  fileImportBatchs: prop<FileImportBatch[]>(() => []),
  isLoading: prop<boolean>(true).withSetter(),
  page: prop<number>(1).withSetter(),
  pageCount: prop<number>(1).withSetter(),
  pageSize: prop<number>(undefined).withSetter(),
  sortValue: prop<SortValue>(() => ({ isDesc: true, key: "dateCreated" })).withSetter(),
}) {
  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  _addFileImportBatch(fileImportBatch: ModelCreationData<FileImportBatch>) {
    this.fileImportBatchs.push(new FileImportBatch(fileImportBatch));
  }

  @modelAction
  _deleteFileImportBatch(id: string) {
    this.fileImportBatchs = this.fileImportBatchs.filter((d) => d.id !== id);
  }

  @modelAction
  overwriteFileImportBatchs(fileImportBatchs: ModelCreationData<FileImportBatch>[]) {
    this.fileImportBatchs = fileImportBatchs.map((d) => new FileImportBatch(d));
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  createFileImportBatch = asyncAction(async (args: db.CreateFileImportBatchInput) => {
    this.setIsLoading(true);
    const res = await trpc.createFileImportBatch.mutate({ args });
    this.setIsLoading(false);
    if (res.error) throw new Error(res.error);
    return res.data;
  });

  @modelFlow
  deleteFileImportBatch = asyncAction(async (args: db.DeleteFileImportBatchInput) => {
    this.setIsLoading(true);
    const res = await trpc.deleteFileImportBatch.mutate({ args });
    this.setIsLoading(false);
    if (res.error) throw new Error(res.error);
    return res.data;
  });

  @modelFlow
  loadFileImportBatchs = asyncAction(
    async ({ withOverwrite = true, ...args }: db.ListFileImportBatchsInput = {}) => {
      this.setIsLoading(true);
      const res = await trpc.listFileImportBatchs.mutate({
        args: {
          filter: JSON.parse(JSON.stringify(args.filter)),
          page: args.page ?? this.page,
          pageSize: args.pageSize ?? this.pageSize,
          sort: args.sort ?? { [this.sortValue.key]: this.sortValue.isDesc ? "desc" : "asc" },
        },
      });
      this.setIsLoading(false);
      if (res.error) throw new Error(res.error);
      if (withOverwrite) {
        this.overwriteFileImportBatchs(res.data.items as ModelCreationData<FileImportBatch>[]);
        this.setPageCount(res.data.pageCount);
      }
      return res.data;
    },
  );

  @modelFlow
  updateFileImportBatch = asyncAction(async (args: db.UpdateFileImportBatchInput) => {
    this.setIsLoading(true);
    const res = await trpc.updateFileImportBatch.mutate({ args });
    this.setIsLoading(false);
    if (res.error) throw new Error(res.error);
    return res.data;
  });

  /* ----------------------------- DYNAMIC GETTERS ---------------------------- */
  getFileImportBatch(id: string) {
    return this.fileImportBatchs.find((d) => d.id === id);
  }
}

/* --------------------------------------------------------------------------- */
/*                               File
/* --------------------------------------------------------------------------- */
@model("medior/_File")
export class _File extends Model({
  dateCreated: prop<string>(() => dayjs().toISOString()),
  id: prop<string>(),
  dateModified: prop<string>(),
  diffusionParams: prop<string>(null),
  duration: prop<number>(null),
  ext: prop<string>(),
  frameRate: prop<number>(),
  hash: prop<string>(),
  height: prop<number>(),
  isArchived: prop<boolean>(),
  originalHash: prop<string>(null),
  originalName: prop<string>(null),
  originalPath: prop<string>(),
  path: prop<string>(),
  rating: prop<number>(),
  size: prop<number>(),
  tagIds: prop<string[]>(() => []),
  tagIdsWithAncestors: prop<string[]>(() => []),
  thumbPaths: prop<string[]>(() => []),
  width: prop<number>(),
}) {
  @modelAction
  update(updates: Partial<ModelCreationData<this>>) {
    applySnapshot(this, { ...getSnapshot(this), ...updates });
  }
}

@model("medior/_FileStore")
export class _FileStore extends Model({
  files: prop<File[]>(() => []),
  isLoading: prop<boolean>(true).withSetter(),
  page: prop<number>(1).withSetter(),
  pageCount: prop<number>(1).withSetter(),
  pageSize: prop<number>(undefined).withSetter(),
  sortValue: prop<SortValue>(() => ({ isDesc: true, key: "hash" })).withSetter(),
}) {
  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  _addFile(file: ModelCreationData<File>) {
    this.files.push(new File(file));
  }

  @modelAction
  _deleteFile(id: string) {
    this.files = this.files.filter((d) => d.id !== id);
  }

  @modelAction
  overwriteFiles(files: ModelCreationData<File>[]) {
    this.files = files.map((d) => new File(d));
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  createFile = asyncAction(async (args: db.CreateFileInput) => {
    this.setIsLoading(true);
    const res = await trpc.createFile.mutate({ args });
    this.setIsLoading(false);
    if (res.error) throw new Error(res.error);
    return res.data;
  });

  @modelFlow
  deleteFile = asyncAction(async (args: db.DeleteFileInput) => {
    this.setIsLoading(true);
    const res = await trpc.deleteFile.mutate({ args });
    this.setIsLoading(false);
    if (res.error) throw new Error(res.error);
    return res.data;
  });

  @modelFlow
  loadFiles = asyncAction(async ({ withOverwrite = true, ...args }: db.ListFilesInput = {}) => {
    this.setIsLoading(true);
    const res = await trpc.listFiles.mutate({
      args: {
        filter: JSON.parse(JSON.stringify(args.filter)),
        page: args.page ?? this.page,
        pageSize: args.pageSize ?? this.pageSize,
        sort: args.sort ?? { [this.sortValue.key]: this.sortValue.isDesc ? "desc" : "asc" },
      },
    });
    this.setIsLoading(false);
    if (res.error) throw new Error(res.error);
    if (withOverwrite) {
      this.overwriteFiles(res.data.items as ModelCreationData<File>[]);
      this.setPageCount(res.data.pageCount);
    }
    return res.data;
  });

  @modelFlow
  updateFile = asyncAction(async (args: db._UpdateFileInput) => {
    this.setIsLoading(true);
    const res = await trpc._updateFile.mutate({ args });
    this.setIsLoading(false);
    if (res.error) throw new Error(res.error);
    return res.data;
  });

  /* ----------------------------- DYNAMIC GETTERS ---------------------------- */
  getFile(id: string) {
    return this.files.find((d) => d.id === id);
  }
}

/* --------------------------------------------------------------------------- */
/*                               RegExMap
/* --------------------------------------------------------------------------- */
@model("medior/_RegExMap")
export class _RegExMap extends Model({
  id: prop<string>(null),
  regEx: prop<string>(),
  testString: prop<string>(null),
  types: prop<Array<"diffusionParams" | "fileName" | "folderName">>(),
}) {
  @modelAction
  update(updates: Partial<ModelCreationData<this>>) {
    applySnapshot(this, { ...getSnapshot(this), ...updates });
  }
}

@model("medior/_RegExMapStore")
export class _RegExMapStore extends Model({
  regExMaps: prop<_RegExMap[]>(() => []),
  isLoading: prop<boolean>(true).withSetter(),
  page: prop<number>(1).withSetter(),
  pageCount: prop<number>(1).withSetter(),
  pageSize: prop<number>(undefined).withSetter(),
  sortValue: prop<SortValue>(() => ({ isDesc: false, key: "regEx" })).withSetter(),
}) {
  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  _addRegExMap(regExMap: ModelCreationData<_RegExMap>) {
    this.regExMaps.push(new _RegExMap(regExMap));
  }

  @modelAction
  _deleteRegExMap(id: string) {
    this.regExMaps = this.regExMaps.filter((d) => d.id !== id);
  }

  @modelAction
  overwriteRegExMaps(regExMaps: ModelCreationData<_RegExMap>[]) {
    this.regExMaps = regExMaps.map((d) => new _RegExMap(d));
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  createRegExMap = asyncAction(async (args: db.CreateRegExMapInput) => {
    this.setIsLoading(true);
    const res = await trpc.createRegExMap.mutate({ args });
    this.setIsLoading(false);
    if (res.error) throw new Error(res.error);
    return res.data;
  });

  @modelFlow
  deleteRegExMap = asyncAction(async (args: db.DeleteRegExMapInput) => {
    this.setIsLoading(true);
    const res = await trpc.deleteRegExMap.mutate({ args });
    this.setIsLoading(false);
    if (res.error) throw new Error(res.error);
    return res.data;
  });

  @modelFlow
  loadRegExMaps = asyncAction(
    async ({ withOverwrite = true, ...args }: db.ListRegExMapsInput = {}) => {
      this.setIsLoading(true);
      const res = await trpc.listRegExMaps.mutate({
        args: {
          filter: JSON.parse(JSON.stringify(args.filter)),
          page: args.page ?? this.page,
          pageSize: args.pageSize ?? this.pageSize,
          sort: args.sort ?? { [this.sortValue.key]: this.sortValue.isDesc ? "desc" : "asc" },
        },
      });
      this.setIsLoading(false);
      if (res.error) throw new Error(res.error);
      if (withOverwrite) {
        this.overwriteRegExMaps(res.data.items as ModelCreationData<_RegExMap>[]);
        this.setPageCount(res.data.pageCount);
      }
      return res.data;
    },
  );

  @modelFlow
  updateRegExMap = asyncAction(async (args: db.UpdateRegExMapInput) => {
    this.setIsLoading(true);
    const res = await trpc.updateRegExMap.mutate({ args });
    this.setIsLoading(false);
    if (res.error) throw new Error(res.error);
    return res.data;
  });

  /* ----------------------------- DYNAMIC GETTERS ---------------------------- */
  getRegExMap(id: string) {
    return this.regExMaps.find((d) => d.id === id);
  }
}

/* --------------------------------------------------------------------------- */
/*                               Tag
/* --------------------------------------------------------------------------- */
@model("medior/_Tag")
export class _Tag extends Model({
  dateCreated: prop<string>(() => dayjs().toISOString()),
  id: prop<string>(),
  aliases: prop<string[]>(() => []),
  ancestorIds: prop<string[]>(() => []),
  childIds: prop<string[]>(() => []),
  count: prop<number>(),
  dateModified: prop<string>(),
  descendantIds: prop<string[]>(() => []),
  label: prop<string>(),
  parentIds: prop<string[]>(() => []),
  regExMap: prop<db.RegExMapSchema>(null),
  thumbPaths: prop<string[]>(),
}) {
  @modelAction
  update(updates: Partial<ModelCreationData<this>>) {
    applySnapshot(this, { ...getSnapshot(this), ...updates });
  }
}

@model("medior/_TagStore")
export class _TagStore extends Model({
  tags: prop<Tag[]>(() => []),
  isLoading: prop<boolean>(true).withSetter(),
  page: prop<number>(1).withSetter(),
  pageCount: prop<number>(1).withSetter(),
  pageSize: prop<number>(undefined).withSetter(),
  sortValue: prop<SortValue>(() => ({ isDesc: false, key: "label" })).withSetter(),
}) {
  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  _addTag(tag: ModelCreationData<Tag>) {
    this.tags.push(new Tag(tag));
  }

  @modelAction
  _deleteTag(id: string) {
    this.tags = this.tags.filter((d) => d.id !== id);
  }

  @modelAction
  overwriteTags(tags: ModelCreationData<Tag>[]) {
    this.tags = tags.map((d) => new Tag(d));
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  createTag = asyncAction(async (args: db._CreateTagInput) => {
    this.setIsLoading(true);
    const res = await trpc._createTag.mutate({ args });
    this.setIsLoading(false);
    if (res.error) throw new Error(res.error);
    return res.data;
  });

  @modelFlow
  deleteTag = asyncAction(async (args: db._DeleteTagInput) => {
    this.setIsLoading(true);
    const res = await trpc._deleteTag.mutate({ args });
    this.setIsLoading(false);
    if (res.error) throw new Error(res.error);
    return res.data;
  });

  @modelFlow
  loadTags = asyncAction(async ({ withOverwrite = true, ...args }: db._ListTagsInput = {}) => {
    this.setIsLoading(true);
    const res = await trpc._listTags.mutate({
      args: {
        filter: JSON.parse(JSON.stringify(args.filter)),
        page: args.page ?? this.page,
        pageSize: args.pageSize ?? this.pageSize,
        sort: args.sort ?? { [this.sortValue.key]: this.sortValue.isDesc ? "desc" : "asc" },
      },
    });
    this.setIsLoading(false);
    if (res.error) throw new Error(res.error);
    if (withOverwrite) {
      this.overwriteTags(res.data.items as ModelCreationData<Tag>[]);
      this.setPageCount(res.data.pageCount);
    }
    return res.data;
  });

  @modelFlow
  updateTag = asyncAction(async (args: db.UpdateTagInput) => {
    this.setIsLoading(true);
    const res = await trpc.updateTag.mutate({ args });
    this.setIsLoading(false);
    if (res.error) throw new Error(res.error);
    return res.data;
  });

  /* ----------------------------- DYNAMIC GETTERS ---------------------------- */
  getTag(id: string) {
    return this.tags.find((d) => d.id === id);
  }
}
