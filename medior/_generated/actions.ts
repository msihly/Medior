/* -------------------------------------------------------------------------- */
/*                    THIS IS A GENERATED FILE. DO NOT EDIT.                  */
/* -------------------------------------------------------------------------- */

import * as models from "medior/_generated/models";
import * as types from "medior/database/types";
import { SocketEventOptions } from "medior/_generated/socket";
import { leanModelToJson, makeAction } from "medior/database/utils";
import { dayjs, socket } from "medior/utils";

/* ------------------------------------ DeletedFile ----------------------------------- */
export const createDeletedFile = makeAction(
  async ({
    args,
    socketOpts,
  }: {
    args: types.CreateDeletedFileInput;
    socketOpts?: SocketEventOptions;
  }) => {
    const model = { ...args, dateCreated: dayjs().toISOString() };

    const res = await models.DeletedFileModel.create(model);
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
    args: types.DeleteDeletedFileInput;
    socketOpts?: SocketEventOptions;
  }) => {
    await models.DeletedFileModel.findByIdAndDelete(args.id);
    socket.emit("onDeletedFileDeleted", args, socketOpts);
  },
);

export const _listDeletedFiles = makeAction(
  async ({
    args,
  }: { args?: types._ListDeletedFilesInput; socketOpts?: SocketEventOptions } = {}) => {
    const filter = { ...args.filter };
    if (args.filter?.id) {
      filter._id = Array.isArray(args.filter.id)
        ? { $in: args.filter.id }
        : typeof args.filter.id === "string"
          ? { $in: [args.filter.id] }
          : args.filter.id;

      delete filter.id;
    }

    const [items, totalCount] = await Promise.all([
      models.DeletedFileModel.find(filter)
        .sort(args.sort ?? { hash: "desc" })
        .skip(Math.max(0, args.page - 1) * args.pageSize)
        .limit(args.pageSize)
        .allowDiskUse(true)
        .lean(),
      models.DeletedFileModel.countDocuments(filter),
    ]);

    if (!items || !(totalCount > -1)) throw new Error("Failed to load filtered DeletedFiles");

    return {
      items: items.map((item) => leanModelToJson<models.DeletedFileSchema>(item)),
      pageCount: Math.ceil(totalCount / args.pageSize),
    };
  },
);

export const updateDeletedFile = makeAction(
  async ({
    args,
    socketOpts,
  }: {
    args: types.UpdateDeletedFileInput;
    socketOpts?: SocketEventOptions;
  }) => {
    const res = leanModelToJson<models.DeletedFileSchema>(
      await models.DeletedFileModel.findByIdAndUpdate(args.id, args.updates, { new: true }).lean(),
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
    args: types.CreateFileCollectionInput;
    socketOpts?: SocketEventOptions;
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

    const res = await models.FileCollectionModel.create(model);
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
    args: types.DeleteFileCollectionInput;
    socketOpts?: SocketEventOptions;
  }) => {
    await models.FileCollectionModel.findByIdAndDelete(args.id);
    socket.emit("onFileCollectionDeleted", args, socketOpts);
  },
);

export const listFileCollections = makeAction(
  async ({
    args,
  }: { args?: types.ListFileCollectionsInput; socketOpts?: SocketEventOptions } = {}) => {
    const filter = { ...args.filter };
    if (args.filter?.id) {
      filter._id = Array.isArray(args.filter.id)
        ? { $in: args.filter.id }
        : typeof args.filter.id === "string"
          ? { $in: [args.filter.id] }
          : args.filter.id;

      delete filter.id;
    }

    const [items, totalCount] = await Promise.all([
      models.FileCollectionModel.find(filter)
        .sort(args.sort ?? { dateCreated: "desc" })
        .skip(Math.max(0, args.page - 1) * args.pageSize)
        .limit(args.pageSize)
        .allowDiskUse(true)
        .lean(),
      models.FileCollectionModel.countDocuments(filter),
    ]);

    if (!items || !(totalCount > -1)) throw new Error("Failed to load filtered FileCollections");

    return {
      items: items.map((item) => leanModelToJson<models.FileCollectionSchema>(item)),
      pageCount: Math.ceil(totalCount / args.pageSize),
    };
  },
);

export const updateFileCollection = makeAction(
  async ({
    args,
    socketOpts,
  }: {
    args: types.UpdateFileCollectionInput;
    socketOpts?: SocketEventOptions;
  }) => {
    const res = leanModelToJson<models.FileCollectionSchema>(
      await models.FileCollectionModel.findByIdAndUpdate(args.id, args.updates, {
        new: true,
      }).lean(),
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
    args: types.CreateFileImportBatchInput;
    socketOpts?: SocketEventOptions;
  }) => {
    const model = { ...args, dateCreated: dayjs().toISOString(), imports: [] };

    const res = await models.FileImportBatchModel.create(model);
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
    args: types.DeleteFileImportBatchInput;
    socketOpts?: SocketEventOptions;
  }) => {
    await models.FileImportBatchModel.findByIdAndDelete(args.id);
    socket.emit("onFileImportBatchDeleted", args, socketOpts);
  },
);

export const listFileImportBatchs = makeAction(
  async ({
    args,
  }: { args?: types.ListFileImportBatchsInput; socketOpts?: SocketEventOptions } = {}) => {
    const filter = { ...args.filter };
    if (args.filter?.id) {
      filter._id = Array.isArray(args.filter.id)
        ? { $in: args.filter.id }
        : typeof args.filter.id === "string"
          ? { $in: [args.filter.id] }
          : args.filter.id;

      delete filter.id;
    }

    const [items, totalCount] = await Promise.all([
      models.FileImportBatchModel.find(filter)
        .sort(args.sort ?? { dateCreated: "desc" })
        .skip(Math.max(0, args.page - 1) * args.pageSize)
        .limit(args.pageSize)
        .allowDiskUse(true)
        .lean(),
      models.FileImportBatchModel.countDocuments(filter),
    ]);

    if (!items || !(totalCount > -1)) throw new Error("Failed to load filtered FileImportBatchs");

    return {
      items: items.map((item) => leanModelToJson<models.FileImportBatchSchema>(item)),
      pageCount: Math.ceil(totalCount / args.pageSize),
    };
  },
);

export const updateFileImportBatch = makeAction(
  async ({
    args,
    socketOpts,
  }: {
    args: types.UpdateFileImportBatchInput;
    socketOpts?: SocketEventOptions;
  }) => {
    const res = leanModelToJson<models.FileImportBatchSchema>(
      await models.FileImportBatchModel.findByIdAndUpdate(args.id, args.updates, {
        new: true,
      }).lean(),
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
    args: types.CreateFileInput;
    socketOpts?: SocketEventOptions;
  }) => {
    const model = {
      ...args,
      dateCreated: dayjs().toISOString(),
      tagIds: [],
      tagIdsWithAncestors: [],
      thumbPaths: [],
    };

    const res = await models.FileModel.create(model);
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
    args: types.DeleteFileInput;
    socketOpts?: SocketEventOptions;
  }) => {
    await models.FileModel.findByIdAndDelete(args.id);
    socket.emit("onFileDeleted", args, socketOpts);
  },
);

export const listFiles = makeAction(
  async ({ args }: { args?: types.ListFilesInput; socketOpts?: SocketEventOptions } = {}) => {
    const filter = { ...args.filter };
    if (args.filter?.id) {
      filter._id = Array.isArray(args.filter.id)
        ? { $in: args.filter.id }
        : typeof args.filter.id === "string"
          ? { $in: [args.filter.id] }
          : args.filter.id;

      delete filter.id;
    }

    const [items, totalCount] = await Promise.all([
      models.FileModel.find(filter)
        .sort(args.sort ?? { hash: "desc" })
        .skip(Math.max(0, args.page - 1) * args.pageSize)
        .limit(args.pageSize)
        .allowDiskUse(true)
        .lean(),
      models.FileModel.countDocuments(filter),
    ]);

    if (!items || !(totalCount > -1)) throw new Error("Failed to load filtered Files");

    return {
      items: items.map((item) => leanModelToJson<models.FileSchema>(item)),
      pageCount: Math.ceil(totalCount / args.pageSize),
    };
  },
);

export const _updateFile = makeAction(
  async ({
    args,
    socketOpts,
  }: {
    args: types._UpdateFileInput;
    socketOpts?: SocketEventOptions;
  }) => {
    const res = leanModelToJson<models.FileSchema>(
      await models.FileModel.findByIdAndUpdate(args.id, args.updates, { new: true }).lean(),
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
    args: types.CreateRegExMapInput;
    socketOpts?: SocketEventOptions;
  }) => {
    const model = { ...args };

    const res = await models.RegExMapModel.create(model);
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
    args: types.DeleteRegExMapInput;
    socketOpts?: SocketEventOptions;
  }) => {
    await models.RegExMapModel.findByIdAndDelete(args.id);
    socket.emit("onRegExMapDeleted", args, socketOpts);
  },
);

export const listRegExMaps = makeAction(
  async ({ args }: { args?: types.ListRegExMapsInput; socketOpts?: SocketEventOptions } = {}) => {
    const filter = { ...args.filter };
    if (args.filter?.id) {
      filter._id = Array.isArray(args.filter.id)
        ? { $in: args.filter.id }
        : typeof args.filter.id === "string"
          ? { $in: [args.filter.id] }
          : args.filter.id;

      delete filter.id;
    }

    const [items, totalCount] = await Promise.all([
      models.RegExMapModel.find(filter)
        .sort(args.sort ?? { regEx: "asc" })
        .skip(Math.max(0, args.page - 1) * args.pageSize)
        .limit(args.pageSize)
        .allowDiskUse(true)
        .lean(),
      models.RegExMapModel.countDocuments(filter),
    ]);

    if (!items || !(totalCount > -1)) throw new Error("Failed to load filtered RegExMaps");

    return {
      items: items.map((item) => leanModelToJson<models.RegExMapSchema>(item)),
      pageCount: Math.ceil(totalCount / args.pageSize),
    };
  },
);

export const updateRegExMap = makeAction(
  async ({
    args,
    socketOpts,
  }: {
    args: types.UpdateRegExMapInput;
    socketOpts?: SocketEventOptions;
  }) => {
    const res = leanModelToJson<models.RegExMapSchema>(
      await models.RegExMapModel.findByIdAndUpdate(args.id, args.updates, { new: true }).lean(),
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
    args: types._CreateTagInput;
    socketOpts?: SocketEventOptions;
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

    const res = await models.TagModel.create(model);
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
    args: types._DeleteTagInput;
    socketOpts?: SocketEventOptions;
  }) => {
    await models.TagModel.findByIdAndDelete(args.id);
    socket.emit("onTagDeleted", args, socketOpts);
  },
);

export const _listTags = makeAction(
  async ({ args }: { args?: types._ListTagsInput; socketOpts?: SocketEventOptions } = {}) => {
    const filter = { ...args.filter };
    if (args.filter?.id) {
      filter._id = Array.isArray(args.filter.id)
        ? { $in: args.filter.id }
        : typeof args.filter.id === "string"
          ? { $in: [args.filter.id] }
          : args.filter.id;

      delete filter.id;
    }

    const [items, totalCount] = await Promise.all([
      models.TagModel.find(filter)
        .sort(args.sort ?? { label: "asc" })
        .skip(Math.max(0, args.page - 1) * args.pageSize)
        .limit(args.pageSize)
        .allowDiskUse(true)
        .lean(),
      models.TagModel.countDocuments(filter),
    ]);

    if (!items || !(totalCount > -1)) throw new Error("Failed to load filtered Tags");

    return {
      items: items.map((item) => leanModelToJson<models.TagSchema>(item)),
      pageCount: Math.ceil(totalCount / args.pageSize),
    };
  },
);

export const updateTag = makeAction(
  async ({ args, socketOpts }: { args: types.UpdateTagInput; socketOpts?: SocketEventOptions }) => {
    const res = leanModelToJson<models.TagSchema>(
      await models.TagModel.findByIdAndUpdate(args.id, args.updates, { new: true }).lean(),
    );

    socket.emit("onTagUpdated", args, socketOpts);
    return res;
  },
);
