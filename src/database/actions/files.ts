import { app } from "electron";
import path from "path";
import fs from "fs/promises";
import { PipelineStage } from "mongoose";
import * as db from "database";
import { dayjs, handleErrors, socket } from "utils";
import { leanModelToJson, objectIds } from "./utils";

const FACE_MIN_CONFIDENCE = 0.4;
const FACE_MODELS_PATH = app.isPackaged
  ? path.resolve(process.resourcesPath, "extraResources/face-models")
  : "src/face-models";

const createFilterPipeline = ({
  excludedAnyTagIds,
  includedAllTagIds,
  includedAnyTagIds,
  includeTagged,
  includeUntagged,
  isArchived,
  isSortDesc,
  selectedImageTypes,
  selectedVideoTypes,
  sortKey,
}: db.CreateFilterPipelineInput) => {
  const enabledExts = Object.entries({
    ...selectedImageTypes,
    ...selectedVideoTypes,
  }).reduce((acc, [key, isEnabled]) => {
    if (isEnabled) acc.push(`.${key}`);
    return acc;
  }, [] as string[]);

  const sortDir = isSortDesc ? -1 : 1;

  return {
    $match: {
      isArchived,
      ext: { $in: enabledExts },
      $and: [
        includeTagged ? { tagIds: { $ne: [] } } : {},
        includeUntagged ? { tagIds: { $eq: [] } } : {},
        includedAllTagIds?.length > 0 ? { tagIds: { $all: objectIds(includedAllTagIds) } } : {},
        includedAnyTagIds?.length > 0 ? { tagIds: { $in: objectIds(includedAnyTagIds) } } : {},
        excludedAnyTagIds?.length > 0 ? { tagIds: { $nin: objectIds(excludedAnyTagIds) } } : {},
      ],
    },
    $sort: { [sortKey]: sortDir, _id: sortDir } as { [key: string]: 1 | -1 },
  };
};

export const deleteFiles = ({ fileIds }: db.DeleteFilesInput) =>
  handleErrors(async () => {
    const collections = (
      await db.FileCollectionModel.find({
        fileIdIndexes: { $elemMatch: { fileId: { $in: fileIds } } },
      }).lean()
    ).map((c) => leanModelToJson<db.FileCollection>(c));

    await Promise.all(
      collections.map((collection) => {
        const fileIdIndexes = collection.fileIdIndexes.filter(
          (fileIdIndex) => !fileIds.includes(String(fileIdIndex.fileId))
        );

        if (!fileIdIndexes.length) return db.deleteCollection({ id: collection.id });
        return db.updateCollection({ fileIdIndexes, id: collection.id });
      })
    );

    await db.FileModel.deleteMany({ _id: { $in: fileIds } });

    socket.emit("filesDeleted", { fileIds });
  });

export const detectFaces = async ({ imagePath }: db.DetectFacesInput) =>
  handleErrors(async () => {
    const faceapi = await import("@vladmandic/face-api/dist/face-api.node-gpu.js");
    const tf = await import("@tensorflow/tfjs-node-gpu");
    const buffer = await fs.readFile(imagePath);
    const tensor = tf.node.decodeImage(buffer);

    try {
      const options = new faceapi.SsdMobilenetv1Options({ minConfidence: FACE_MIN_CONFIDENCE });
      const faces = await faceapi
        .detectAllFaces(tensor as any, options)
        .withFaceLandmarks()
        .withFaceExpressions()
        .withFaceDescriptors()
        .run();

      tf.dispose(tensor);
      return faces;
    } catch (err) {
      tf.dispose(tensor);
      throw new Error(err);
    }
  });

export const editFileTags = ({
  addedTagIds = [],
  batchId,
  fileIds,
  removedTagIds = [],
}: db.EditFileTagsInput) =>
  handleErrors(async () => {
    if (!fileIds.length) throw new Error("Missing fileIds in editFileTags");
    if (!addedTagIds.length && !removedTagIds.length)
      throw new Error("Missing updated tagIds in editFileTags");

    const dateModified = dayjs().toISOString();

    await db.FileModel.updateMany(
      { _id: { $in: fileIds } },
      {
        $addToSet: { tagIds: { $each: addedTagIds } },
        $pullAll: { tagIds: removedTagIds },
        dateModified,
      }
    );

    if (batchId)
      await db.FileImportBatchModel.updateMany(
        { _id: batchId },
        {
          $addToSet: { tagIds: { $each: addedTagIds } },
          $pullAll: { tagIds: removedTagIds },
        }
      );

    await db.recalculateTagCounts({ tagIds: [...new Set([...addedTagIds, ...removedTagIds])] });

    socket.emit("fileTagsUpdated", { addedTagIds, batchId, fileIds, removedTagIds });
  });

export const getFileByHash = ({ hash }: db.GetFileByHashInput) =>
  handleErrors(async () => leanModelToJson<db.File>(await db.FileModel.findOne({ hash }).lean()));

export const getShiftSelectedFiles = ({
  clickedId,
  clickedIndex,
  isSortDesc,
  selectedIds,
  sortKey,
  ...filterParams
}: db.GetShiftSelectedFilesInput) =>
  handleErrors(async () => {
    if (selectedIds.length === 0) return { idsToDeselect: [], idsToSelect: [clickedId] };
    if (selectedIds.length === 1 && selectedIds[0] === clickedId)
      return { idsToDeselect: [clickedId], idsToSelect: [] };

    const filterPipeline = createFilterPipeline({ ...filterParams, isSortDesc, sortKey });

    // const funcPerfStart = performance.now();

    // let perfStart = performance.now();
    // const perfLog = (str: string) => {
    //   logToFile("debug", round(performance.now() - perfStart, 0), "ms -", str);
    //   perfStart = performance.now();
    // };

    const getSelectedIndex = async (type: "first" | "last") => {
      const sortOp = isSortDesc ? "$gt" : "$lt";

      const selectedFiles = await db.FileModel.find({
        ...filterPipeline.$match,
        _id: { $in: objectIds(selectedIds) },
      }).sort(filterPipeline.$sort);

      if (!selectedFiles || selectedFiles.length === 0)
        throw new Error(`Failed to load selected files`);

      const selectedFile =
        type === "first" ? selectedFiles[0] : selectedFiles[selectedFiles.length - 1];

      // perfLog(`Get ${type} selected document`);

      const selectedFileIndex = await db.FileModel.countDocuments({
        ...filterPipeline.$match,
        $or: [
          { [sortKey]: selectedFile[sortKey], _id: { [sortOp]: selectedFile._id } },
          { [sortKey]: { [sortOp]: selectedFile[sortKey] } },
        ],
      });
      if (!(selectedFileIndex > -1)) throw new Error(`Failed to load ${type} selected index`);

      // perfLog(`Get ${type} selected index`);

      // logToFile(
      //   "debug",
      //   JSON.stringify(
      //     { [`${type}SelectedId`]: selectedFile._id.toString(), selectedFileIndex },
      //     null,
      //     2
      //   )
      // );

      return selectedFileIndex;
    };

    const firstSelectedIndex = await getSelectedIndex("first");
    if (!(firstSelectedIndex > -1)) return { idsToDeselect: [], idsToSelect: [clickedId] };
    if (firstSelectedIndex === clickedIndex) return { idsToDeselect: [clickedId], idsToSelect: [] };

    /*
    const cursor = db.FileModel.find(filterPipeline.$match)
      .sort(filterPipeline.$sort)
      .allowDiskUse(true)
      .cursor();
    let count = 0;

    for await (const doc of cursor) {
      if (doc._id.toString() === firstSelectedId) break;
      count++;
    }

    const firstSelectedIndex = count;
    perfLog("Get first selected index");
    */

    /*
    const firstSelectedIndexPipeline: PipelineStage[] = [
      { $match: filterPipeline.$match },
      { $project: { _id: 1, [sortKey]: 1 } },
      {
        $addFields: {
          rankSortBy: {
            $concat: [{ $toString: `$${sortKey}` }, "_", { $toString: "$_id" }],
          },
        },
      },
      { $project: { rankSortBy: 1 } },
      {
        $setWindowFields: {
          sortBy: { rankSortBy: isSortDesc ? -1 : 1 },
          output: { rank: { $rank: {} } },
        },
      },
      { $match: { _id: objectId(firstSelectedId) } },
      { $project: { _id: 0, rank: 1 } },
    ];

    logToFile(
      "debug",
      "First selected index pipeline:",
      JSON.stringify(firstSelectedIndexPipeline, null, 2)
    );

    const firstSelectedIndexRes: { rank: number } = (
      await db.FileModel.aggregate(firstSelectedIndexPipeline).allowDiskUse(true)
    )?.[0];
    if (!firstSelectedIndexRes) throw new Error("Failed to load first selected index");
    const firstSelectedIndex = firstSelectedIndexRes.rank - 1;

    perfLog("Get first selected index");
    */

    /*
    let firstSelected = null;
    let firstSelectedIndex = -1;

    const cursor = db.FileModel.find(filterPipeline.$match)
      .sort(filterPipeline.$sort)
      .limit(clickedIndex)
      .allowDiskUse(true)
      .cursor();

    for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
      firstSelectedIndex++;
      if (selectedIds.includes(doc._id.toString())) {
        firstSelected = doc;
        break;
      }
    }

    logToFile(
      "debug",
      "First selected:",
      JSON.stringify(
        {
          firstSelectedId: firstSelected?.id,
          firstSelectedIndex,
        },
        null,
        2
      )
    );
    perfLog("Get first selected index");

    if (!(firstSelectedIndex > -1)) return { idsToDeselect: [], idsToSelect: [clickedId] };
    if (firstSelectedIndex === clickedIndex) return { idsToDeselect: [clickedId], idsToSelect: [] };
    */

    /*
    const firstSelectedId = firstSelected?._id?.toString?.();
    if (!firstSelectedId) return { idsToDeselect: [], idsToSelect: [clickedId] };
    if (firstSelectedId === clickedId) return { idsToDeselect: [clickedId], idsToSelect: [] };

    const firstIndex = await db.FileModel.countDocuments({
      [sortKey]: { [isSortDesc ? "$gt" : "$lt"]: firstSelected[sortKey] },
    });

    perfLog("Get first index");
    */

    const isFirstAfterClicked = firstSelectedIndex > clickedIndex;
    const lastSelectedIndex = isFirstAfterClicked ? await getSelectedIndex("last") : null;

    const endIndex = isFirstAfterClicked ? lastSelectedIndex : clickedIndex;
    const startIndex = isFirstAfterClicked ? clickedIndex : firstSelectedIndex;

    const limit = endIndex + 1;
    const skip = startIndex;

    const mainPipeline: PipelineStage[] = [
      { $match: filterPipeline.$match },
      { $sort: filterPipeline.$sort },
      ...(limit > -1 ? [{ $limit: limit }] : []),
      ...(skip > -1 ? [{ $skip: skip }] : []),
      { $project: { _id: 1 } },
      { $group: { _id: null, filteredIds: { $push: "$_id" } } },
      {
        $addFields: {
          selectedIdsNotInFiltered: {
            $filter: {
              input: objectIds(selectedIds),
              as: "id",
              cond: { $not: { $in: ["$$id", "$filteredIds"] } },
            },
      },
          selectedIdsInFiltered: {
            $filter: {
              input: objectIds(selectedIds),
              as: "id",
              cond: { $in: ["$$id", "$filteredIds"] },
            },
          },
        },
      },
      {
        $addFields: {
          newSelectedIds:
            startIndex === endIndex
              ? []
              : isFirstAfterClicked
              ? { $slice: ["$filteredIds", 0, limit] }
              : { $slice: ["$filteredIds", 0, limit - skip] },
        },
      },
      {
        $addFields: {
          idsToDeselect: {
            $concatArrays: [
              "$selectedIdsNotInFiltered",
              {
                $filter: {
                  input: "$selectedIdsInFiltered",
                  as: "id",
                  cond: { $not: { $in: ["$$id", "$newSelectedIds"] } },
                },
              },
            ],
          },
          idsToSelect: {
            $filter: {
              input: "$newSelectedIds",
              as: "id",
              cond: { $not: { $in: ["$$id", objectIds(selectedIds)] } },
            },
          },
        },
      },
      { $project: { _id: 0, idsToDeselect: 1, idsToSelect: 1 } },
    ];

    // logToFile(
    //   "debug",
    //   JSON.stringify(
    //     {
    //       clickedId,
    //       clickedIndex,
    //       firstSelectedIndex,
    //       lastSelectedIndex,
    //       startIndex,
    //       endIndex,
    //       limit,
    //       skip,
    //     },
    //     null,
    //     2
    //   )
    // );

    // logToFile("debug", "Main pipeline:", JSON.stringify(mainPipeline, null, 2));

    const mainRes: {
      idsToDeselect: string[];
      idsToSelect: string[];
    } = (await db.FileModel.aggregate(mainPipeline).allowDiskUse(true)).flatMap((f) => f)?.[0];
    if (!mainRes) throw new Error("Failed to load shift selected file IDs");

    // perfLog("Get main res");
    // logToFile("debug", "Main res:", JSON.stringify(mainRes, null, 2));
    // logToFile("debug", `Total time: ${round(performance.now() - funcPerfStart, 0)} ms`);

    return mainRes;

    /* -------------------------------- OLD LOGIC ------------------------------- */
    /*
    const res: {
      filteredIds: { _id: string }[];
    } = (await db.FileModel.aggregate(pipeline).allowDiskUse(true)).flatMap((f) => f)?.[0];
    if (!res) throw new Error("Failed to load shift selected file IDs");

    const filteredIds = res.filteredIds.map((f) => f._id.toString());

    const [selectedIdsNotInFiltered, selectedIdsInFiltered] = selectedIds.reduce(
      (acc, cur) => (acc[!filteredIds.includes(cur) ? 0 : 1].push(cur), acc),
      [[], []] as string[][]
    );

    const clickedIndex = filteredIds.indexOf(clickedId);
    const firstIndex = filteredIds.indexOf(selectedIdsInFiltered[0]);
    const isFirstAfterClicked = firstIndex >= clickedIndex;

    const startIndex = isFirstAfterClicked ? clickedIndex : firstIndex;
    const endIndex = isFirstAfterClicked ? firstIndex : clickedIndex;

    const newSelectedIds =
      startIndex === endIndex ? [] : filteredIds.slice(startIndex, endIndex + 1);
    const idsToDeselect = [
      ...selectedIdsNotInFiltered,
      ...selectedIdsInFiltered.filter((id) => !newSelectedIds.includes(id)),
    ];

    const alreadySelectedIds = new Set(selectedIds);
    const idsToSelect = newSelectedIds.filter((id) => !alreadySelectedIds.has(id));

    return { idsToDeselect, idsToSelect };
    */
  });

export const importFile = ({
  dateCreated,
  diffusionParams,
  duration,
  ext,
  frameRate,
  hash,
  height,
  originalName,
  originalPath,
  path,
  size,
  tagIds,
  thumbPaths,
  width,
}: db.ImportFileInput) =>
  handleErrors(async () => {
    const file = {
      dateCreated,
      dateModified: dayjs().toISOString(),
      diffusionParams,
      duration,
      ext,
      frameRate,
      hash,
      height,
      isArchived: false,
      originalHash: hash,
      originalName,
      originalPath,
      path,
      rating: 0,
      size,
      tagIds,
      thumbPaths,
      width,
    };

    const res = await db.FileModel.create(file);
    return { ...file, id: res._id.toString() };
  });

export const listFaceModels = ({ ids }: db.ListFaceModelsInput = {}) =>
  handleErrors(async () => {
    return (
      await db.FileModel.find({
        faceModels: { $exists: true, $ne: [] },
        ...(ids ? { _id: { $in: ids } } : {}),
      })
        .select({ _id: 1, faceModels: 1 })
        .lean()
    ).flatMap((file) => {
      return leanModelToJson<db.File>(file).faceModels.map((faceModel) => ({
        box: faceModel.box,
        descriptors: faceModel.descriptors,
        fileId: file._id.toString(),
        tagId: faceModel.tagId,
      }));
    });
  });

export const listFiles = ({ ids }: db.ListFilesInput = {}) =>
  handleErrors(async () => {
    return (await db.FileModel.find(ids ? { _id: { $in: ids } } : undefined).lean()).map((f) =>
      leanModelToJson<db.File>(f)
    );
  });

export const listFilesByTagIds = ({ tagIds }: db.ListFilesByTagIdsInput) =>
  handleErrors(async () => {
    return (await db.FileModel.find({ tagIds: { $in: tagIds } }).lean()).map((f) =>
      leanModelToJson<db.File>(f)
    );
  });

export const listFileIdsForCarousel = ({
  clickedId,
  ...filterParams
}: db.ListFileIdsForCarouselInput) =>
  handleErrors(async () => {
    const filterPipeline = createFilterPipeline(filterParams);

    const pipeline: PipelineStage[] = [
      { $match: filterPipeline.$match },
      {
        $facet: {
          filteredIds: [
            { $sort: filterPipeline.$sort },
            { $limit: 2000 },
            { $project: { _id: 1 } },
          ],
        },
      },
    ];

    const res: {
      filteredIds: { _id: string }[];
    } = (await db.FileModel.aggregate(pipeline).allowDiskUse(true)).flatMap((f) => f)?.[0];
    if (!res) throw new Error("Failed to load filtered file IDs");

    return res.filteredIds.map((f) => f._id.toString());
  });

export const listFilteredFiles = ({ page, pageSize, ...filterParams }: db.ListFilteredFilesInput) =>
  handleErrors(async () => {
    const filterPipeline = createFilterPipeline(filterParams);
    const pipeline: PipelineStage[] = [
      { $match: filterPipeline.$match },
      {
        $facet: {
          files: [
            { $sort: filterPipeline.$sort },
            { $skip: Math.max(0, page - 1) * pageSize },
            { $limit: pageSize },
            { $addFields: { id: "$_id" } },
          ],
          totalDocuments: [{ $count: "count" }],
        },
      },
    ];

    const res: {
      files: db.File[];
      totalDocuments: { count: number }[];
    } = (await db.FileModel.aggregate(pipeline).allowDiskUse(true))?.[0];
    if (!res) throw new Error("Failed to load filtered file IDs");

    const totalDocuments = res.totalDocuments[0]?.count || 0;
    return { files: res.files, pageCount: Math.ceil(totalDocuments / pageSize) };
  });

export const loadFaceApiNets = async () =>
  handleErrors(async () => {
    const faceapi = await import("@vladmandic/face-api/dist/face-api.node-gpu.js");
    await faceapi.nets.ssdMobilenetv1.loadFromDisk(FACE_MODELS_PATH);
    await faceapi.nets.faceLandmark68Net.loadFromDisk(FACE_MODELS_PATH);
    await faceapi.nets.faceExpressionNet.loadFromDisk(FACE_MODELS_PATH);
    await faceapi.nets.faceRecognitionNet.loadFromDisk(FACE_MODELS_PATH);
  });

export const setFileFaceModels = async ({ faceModels, id }: db.SetFileFaceModelsInput) =>
  handleErrors(async () => {
    const updates = { faceModels, dateModified: dayjs().toISOString() };
    await db.FileModel.findOneAndUpdate({ _id: id }, { $set: updates });
    socket.emit("filesUpdated", { fileIds: [id], updates });
  });

export const setFileIsArchived = ({ fileIds = [], isArchived }: db.SetFileIsArchivedInput) =>
  handleErrors(async () => {
    const updates = { isArchived };
    await db.FileModel.updateMany({ _id: { $in: fileIds } }, updates);

    if (isArchived) socket.emit("filesArchived", { fileIds });
    socket.emit("filesUpdated", { fileIds, updates });
  });

export const setFileRating = ({ fileIds = [], rating }: db.SetFileRatingInput) =>
  handleErrors(async () => {
    const updates = { rating, dateModified: dayjs().toISOString() };
    await db.FileModel.updateMany({ _id: { $in: fileIds } }, updates);
    socket.emit("filesUpdated", { fileIds, updates });
  });

export const updateFile = async ({ id, ...updates }: db.UpdateFileInput) =>
  handleErrors(async () => await db.FileModel.updateOne({ _id: id }, updates));
