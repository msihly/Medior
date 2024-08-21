/* -------------------------------------------------------------------------- */
/*                    THIS IS A GENERATED FILE. DO NOT EDIT.                  */
/* -------------------------------------------------------------------------- */

import * as db from ".";
import { leanModelToJson, makeAction } from "medior/database/utils";
import { dayjs, socket } from "medior/utils";
/* ------------------------------------ DeletedFile ----------------------------------- */
export const createDeletedFile = makeAction(
  async ({
    args,
    socketOpts,
  }: {
    args: db.CreateDeletedFileInput;
    socketOpts?: db.SocketEventOptions;
  }) => {
    const model = { ...args, dateCreated: dayjs().toISOString() };

    const res = await db.DeletedFileModel.create(model);
    const id = res._id.toString();

    socket.emit("onDeletedFileCreated", { ...model, id }, socketOpts);
    return { ...model, id };
  },
);

export const deleteDeletedFile = makeAction(
  async ({
    args,
    socketOpts,
  }: {
    args: db.DeleteDeletedFileInput;
    socketOpts?: db.SocketEventOptions;
  }) => {
    await db.DeletedFileModel.findByIdAndDelete(args.id);
    socket.emit("onDeletedFileDeleted", args, socketOpts);
  },
);

export const _listDeletedFiles = makeAction(
  async ({
    args: { filter, page, pageSize, sort },
  }: { args?: db._ListDeletedFilesInput; socketOpts?: db.SocketEventOptions } = {}) => {
    const [items, totalCount] = await Promise.all([
      db.DeletedFileModel.find(filter)
        .sort(sort ?? { hash: "desc" })
        .skip(Math.max(0, page - 1) * pageSize)
        .limit(pageSize)
        .allowDiskUse(true)
        .lean(),
      db.DeletedFileModel.countDocuments(filter),
    ]);

    if (!items || !(totalCount > -1)) throw new Error("Failed to load filtered DeletedFiles");

    return {
      items: items.map((item) => leanModelToJson<db.DeletedFileSchema>(item)),
      pageCount: Math.ceil(totalCount / pageSize),
    };
  },
);

export const updateDeletedFile = makeAction(
  async ({
    args,
    socketOpts,
  }: {
    args: db.UpdateDeletedFileInput;
    socketOpts?: db.SocketEventOptions;
  }) => {
    const res = leanModelToJson<db.DeletedFileSchema>(
      await db.DeletedFileModel.findByIdAndUpdate(args.id, args.updates, { new: true }).lean(),
    );

    socket.emit("onDeletedFileUpdated", args, socketOpts);
    return res;
  },
);

/* ------------------------------------ FileCollection ----------------------------------- */
export const createFileCollection = makeAction(
  async ({
    args,
    socketOpts,
  }: {
    args: db.CreateFileCollectionInput;
    socketOpts?: db.SocketEventOptions;
  }) => {
    const model = {
      ...args,
      dateCreated: dayjs().toISOString(),
      dateModified: null,
      fileCount: 0,
      rating: 0,
      tagIds: [],
      tagIdsWithAncestors: [],
      thumbPaths: [],
    };

    const res = await db.FileCollectionModel.create(model);
    const id = res._id.toString();

    socket.emit("onFileCollectionCreated", { ...model, id }, socketOpts);
    return { ...model, id };
  },
);

export const deleteFileCollection = makeAction(
  async ({
    args,
    socketOpts,
  }: {
    args: db.DeleteFileCollectionInput;
    socketOpts?: db.SocketEventOptions;
  }) => {
    await db.FileCollectionModel.findByIdAndDelete(args.id);
    socket.emit("onFileCollectionDeleted", args, socketOpts);
  },
);

export const listFileCollections = makeAction(
  async ({
    args: { filter, page, pageSize, sort },
  }: { args?: db.ListFileCollectionsInput; socketOpts?: db.SocketEventOptions } = {}) => {
    const [items, totalCount] = await Promise.all([
      db.FileCollectionModel.find(filter)
        .sort(sort ?? { dateCreated: "desc" })
        .skip(Math.max(0, page - 1) * pageSize)
        .limit(pageSize)
        .allowDiskUse(true)
        .lean(),
      db.FileCollectionModel.countDocuments(filter),
    ]);

    if (!items || !(totalCount > -1)) throw new Error("Failed to load filtered FileCollections");

    return {
      items: items.map((item) => leanModelToJson<db.FileCollectionSchema>(item)),
      pageCount: Math.ceil(totalCount / pageSize),
    };
  },
);

export const updateFileCollection = makeAction(
  async ({
    args,
    socketOpts,
  }: {
    args: db.UpdateFileCollectionInput;
    socketOpts?: db.SocketEventOptions;
  }) => {
    const res = leanModelToJson<db.FileCollectionSchema>(
      await db.FileCollectionModel.findByIdAndUpdate(args.id, args.updates, { new: true }).lean(),
    );

    socket.emit("onFileCollectionUpdated", args, socketOpts);
    return res;
  },
);

/* ------------------------------------ FileImportBatch ----------------------------------- */
export const createFileImportBatch = makeAction(
  async ({
    args,
    socketOpts,
  }: {
    args: db.CreateFileImportBatchInput;
    socketOpts?: db.SocketEventOptions;
  }) => {
    const model = { ...args, dateCreated: dayjs().toISOString(), imports: [] };

    const res = await db.FileImportBatchModel.create(model);
    const id = res._id.toString();

    socket.emit("onFileImportBatchCreated", { ...model, id }, socketOpts);
    return { ...model, id };
  },
);

export const deleteFileImportBatch = makeAction(
  async ({
    args,
    socketOpts,
  }: {
    args: db.DeleteFileImportBatchInput;
    socketOpts?: db.SocketEventOptions;
  }) => {
    await db.FileImportBatchModel.findByIdAndDelete(args.id);
    socket.emit("onFileImportBatchDeleted", args, socketOpts);
  },
);

export const listFileImportBatchs = makeAction(
  async ({
    args: { filter, page, pageSize, sort },
  }: { args?: db.ListFileImportBatchsInput; socketOpts?: db.SocketEventOptions } = {}) => {
    const [items, totalCount] = await Promise.all([
      db.FileImportBatchModel.find(filter)
        .sort(sort ?? { dateCreated: "desc" })
        .skip(Math.max(0, page - 1) * pageSize)
        .limit(pageSize)
        .allowDiskUse(true)
        .lean(),
      db.FileImportBatchModel.countDocuments(filter),
    ]);

    if (!items || !(totalCount > -1)) throw new Error("Failed to load filtered FileImportBatchs");

    return {
      items: items.map((item) => leanModelToJson<db.FileImportBatchSchema>(item)),
      pageCount: Math.ceil(totalCount / pageSize),
    };
  },
);

export const updateFileImportBatch = makeAction(
  async ({
    args,
    socketOpts,
  }: {
    args: db.UpdateFileImportBatchInput;
    socketOpts?: db.SocketEventOptions;
  }) => {
    const res = leanModelToJson<db.FileImportBatchSchema>(
      await db.FileImportBatchModel.findByIdAndUpdate(args.id, args.updates, { new: true }).lean(),
    );

    socket.emit("onFileImportBatchUpdated", args, socketOpts);
    return res;
  },
);

/* ------------------------------------ File ----------------------------------- */
export const createFile = makeAction(
  async ({
    args,
    socketOpts,
  }: {
    args: db.CreateFileInput;
    socketOpts?: db.SocketEventOptions;
  }) => {
    const model = {
      ...args,
      dateCreated: dayjs().toISOString(),
      tagIds: [],
      tagIdsWithAncestors: [],
      thumbPaths: [],
    };

    const res = await db.FileModel.create(model);
    const id = res._id.toString();

    socket.emit("onFileCreated", { ...model, id }, socketOpts);
    return { ...model, id };
  },
);

export const deleteFile = makeAction(
  async ({
    args,
    socketOpts,
  }: {
    args: db.DeleteFileInput;
    socketOpts?: db.SocketEventOptions;
  }) => {
    await db.FileModel.findByIdAndDelete(args.id);
    socket.emit("onFileDeleted", args, socketOpts);
  },
);

export const listFiles = makeAction(
  async ({
    args: { filter, page, pageSize, sort },
  }: { args?: db.ListFilesInput; socketOpts?: db.SocketEventOptions } = {}) => {
    const [items, totalCount] = await Promise.all([
      db.FileModel.find(filter)
        .sort(sort ?? { hash: "desc" })
        .skip(Math.max(0, page - 1) * pageSize)
        .limit(pageSize)
        .allowDiskUse(true)
        .lean(),
      db.FileModel.countDocuments(filter),
    ]);

    if (!items || !(totalCount > -1)) throw new Error("Failed to load filtered Files");

    return {
      items: items.map((item) => leanModelToJson<db.FileSchema>(item)),
      pageCount: Math.ceil(totalCount / pageSize),
    };
  },
);

export const _updateFile = makeAction(
  async ({
    args,
    socketOpts,
  }: {
    args: db._UpdateFileInput;
    socketOpts?: db.SocketEventOptions;
  }) => {
    const res = leanModelToJson<db.FileSchema>(
      await db.FileModel.findByIdAndUpdate(args.id, args.updates, { new: true }).lean(),
    );

    socket.emit("onFileUpdated", args, socketOpts);
    return res;
  },
);

/* ------------------------------------ RegExMap ----------------------------------- */
export const createRegExMap = makeAction(
  async ({
    args,
    socketOpts,
  }: {
    args: db.CreateRegExMapInput;
    socketOpts?: db.SocketEventOptions;
  }) => {
    const model = { ...args };

    const res = await db.RegExMapModel.create(model);
    const id = res._id.toString();

    socket.emit("onRegExMapCreated", { ...model, id }, socketOpts);
    return { ...model, id };
  },
);

export const deleteRegExMap = makeAction(
  async ({
    args,
    socketOpts,
  }: {
    args: db.DeleteRegExMapInput;
    socketOpts?: db.SocketEventOptions;
  }) => {
    await db.RegExMapModel.findByIdAndDelete(args.id);
    socket.emit("onRegExMapDeleted", args, socketOpts);
  },
);

export const listRegExMaps = makeAction(
  async ({
    args: { filter, page, pageSize, sort },
  }: { args?: db.ListRegExMapsInput; socketOpts?: db.SocketEventOptions } = {}) => {
    const [items, totalCount] = await Promise.all([
      db.RegExMapModel.find(filter)
        .sort(sort ?? { regEx: "asc" })
        .skip(Math.max(0, page - 1) * pageSize)
        .limit(pageSize)
        .allowDiskUse(true)
        .lean(),
      db.RegExMapModel.countDocuments(filter),
    ]);

    if (!items || !(totalCount > -1)) throw new Error("Failed to load filtered RegExMaps");

    return {
      items: items.map((item) => leanModelToJson<db.RegExMapSchema>(item)),
      pageCount: Math.ceil(totalCount / pageSize),
    };
  },
);

export const updateRegExMap = makeAction(
  async ({
    args,
    socketOpts,
  }: {
    args: db.UpdateRegExMapInput;
    socketOpts?: db.SocketEventOptions;
  }) => {
    const res = leanModelToJson<db.RegExMapSchema>(
      await db.RegExMapModel.findByIdAndUpdate(args.id, args.updates, { new: true }).lean(),
    );

    socket.emit("onRegExMapUpdated", args, socketOpts);
    return res;
  },
);

/* ------------------------------------ Tag ----------------------------------- */
export const _createTag = makeAction(
  async ({
    args,
    socketOpts,
  }: {
    args: db._CreateTagInput;
    socketOpts?: db.SocketEventOptions;
  }) => {
    const model = {
      ...args,
      dateCreated: dayjs().toISOString(),
      aliases: [],
      ancestorIds: [],
      childIds: [],
      descendantIds: [],
      parentIds: [],
      regExMap: null,
    };

    const res = await db.TagModel.create(model);
    const id = res._id.toString();

    socket.emit("onTagCreated", { ...model, id }, socketOpts);
    return { ...model, id };
  },
);

export const _deleteTag = makeAction(
  async ({
    args,
    socketOpts,
  }: {
    args: db._DeleteTagInput;
    socketOpts?: db.SocketEventOptions;
  }) => {
    await db.TagModel.findByIdAndDelete(args.id);
    socket.emit("onTagDeleted", args, socketOpts);
  },
);

export const _listTags = makeAction(
  async ({
    args: { filter, page, pageSize, sort },
  }: { args?: db._ListTagsInput; socketOpts?: db.SocketEventOptions } = {}) => {
    const [items, totalCount] = await Promise.all([
      db.TagModel.find(filter)
        .sort(sort ?? { label: "asc" })
        .skip(Math.max(0, page - 1) * pageSize)
        .limit(pageSize)
        .allowDiskUse(true)
        .lean(),
      db.TagModel.countDocuments(filter),
    ]);

    if (!items || !(totalCount > -1)) throw new Error("Failed to load filtered Tags");

    return {
      items: items.map((item) => leanModelToJson<db.TagSchema>(item)),
      pageCount: Math.ceil(totalCount / pageSize),
    };
  },
);

export const updateTag = makeAction(
  async ({ args, socketOpts }: { args: db.UpdateTagInput; socketOpts?: db.SocketEventOptions }) => {
    const res = leanModelToJson<db.TagSchema>(
      await db.TagModel.findByIdAndUpdate(args.id, args.updates, { new: true }).lean(),
    );

    socket.emit("onTagUpdated", args, socketOpts);
    return res;
  },
);
