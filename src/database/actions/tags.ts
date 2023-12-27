import mongoose, { PipelineStage } from "mongoose";
import * as db from "database";
import { dayjs, handleErrors, socket } from "utils";
import { leanModelToJson } from "./utils";

export const addChildTagIdsToTags = ({ childTagIds, tagIds }: db.AddChildTagIdsToTagsInput) =>
  handleErrors(async () => {
    const dateModified = dayjs().toISOString();
    await db.TagModel.updateMany(
      { _id: { $in: tagIds } },
      { $addToSet: { childIds: childTagIds }, dateModified }
    );
    return dateModified;
  });

export const addParentTagIdsToTags = ({ parentTagIds, tagIds }: db.AddParentTagIdsToTagsInput) =>
  handleErrors(async () => {
    const dateModified = dayjs().toISOString();
    await db.TagModel.updateMany(
      { _id: { $in: tagIds } },
      { $addToSet: { parentIds: parentTagIds }, dateModified }
    );
    return dateModified;
  });

export const createTag = ({
  aliases = [],
  childIds = [],
  label,
  parentIds = [],
}: db.CreateTagInput) =>
  handleErrors(async () => {
    const dateCreated = dayjs().toISOString();
    const tag = {
      aliases,
      childIds,
      count: 0,
      dateCreated,
      dateModified: dateCreated,
      label,
      parentIds,
    };

    const res = await db.TagModel.create(tag);
    return { ...tag, id: res._id.toString() };
  });

export const deleteTag = ({ id }: db.DeleteTagInput) =>
  handleErrors(async () => {
    const dateModified = dayjs().toISOString();
    const tagIds = [id];

    await Promise.all([
      await db.FileImportBatchModel.updateMany({ tagIds }, { $pull: { tagIds } }),
      await db.FileModel.updateMany({ tagIds }, { $pull: { tagIds }, dateModified }),
      await db.RegExMapModel.updateMany({ tagIds }, { $pull: { tagIds } }),
      await db.TagModel.updateMany(
        { $or: [{ childIds: id }, { parentIds: id }] },
        { $pullAll: { childIds: tagIds, parentIds: tagIds }, dateModified }
      ),
    ]);

    await db.TagModel.deleteOne({ _id: id });

    socket.emit("tagDeleted", { tagId: id });
  });

export const editTag = ({ aliases, childIds, id, label, parentIds }: db.EditTagInput) =>
  handleErrors(async () => {
    const dateModified = dayjs().toISOString();
    return await db.TagModel.updateOne(
      { _id: id },
      { aliases, childIds, dateModified, label, parentIds }
    );
  });

export const getAllTags = () =>
  handleErrors(async () =>
    (await db.TagModel.find().lean()).map((r) => leanModelToJson<db.Tag>(r))
  );

export const onTagCreated = async ({ tag }: db.OnTagCreatedInput) =>
  handleErrors(async () => !!socket.emit("tagCreated", { tag }));

export const onTagUpdated = async ({ tagId, updates }: db.OnTagUpdatedInput) =>
  handleErrors(async () => !!socket.emit("tagUpdated", { tagId, updates }));

export const recalculateTagCounts = async ({ tagId }: db.RecalculateTagCountsInput) =>
  handleErrors(async () => {
    const pipeline: PipelineStage[] = [
      { $match: { _id: new mongoose.Types.ObjectId(tagId) } },
      {
        $graphLookup: {
          from: "tags",
          startWith: "$_id",
          connectFromField: "_id",
          connectToField: "childIds",
          as: "ancestors",
          depthField: "depth",
        },
      },
      {
        $project: {
          _id: 1,
          label: 1,
          ancestors: { _id: 1, label: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          tagIds: {
            $concatArrays: [
              [{ _id: "$_id", label: "$label" }],
              {
                $map: {
                  input: "$ancestors",
                  in: { _id: "$$this._id", label: "$$this.label" },
                },
              },
            ],
          },
        },
      },
      { $unwind: { path: "$tagIds" } },
      {
        $graphLookup: {
          from: "tags",
          startWith: "$tagIds._id",
          connectFromField: "_id",
          connectToField: "parentIds",
          as: "descendantTags",
          depthField: "depth",
        },
      },
      {
        $project: {
          _id: "$tagIds._id",
          label: "$tagIds.label",
          descendantTags: { _id: 1, label: 1 },
        },
      },
      {
        $project: {
          _id: 1,
          label: 1,
          tagIds: {
            $reduce: {
              input: {
                $concatArrays: [
                  [{ _id: "$_id" }],
                  {
                    $map: {
                      input: "$descendantTags",
                      in: { _id: "$$this._id" },
                    },
                  },
                ],
              },
              initialValue: [],
              in: { $concatArrays: ["$$value", ["$$this._id"]] },
            },
          },
        },
      },
      {
        $lookup: {
          from: "files",
          localField: "tagIds",
          foreignField: "tagIds",
          as: "descendantFiles",
          pipeline: [{ $project: { _id: 1 } }],
        },
      },
      {
        $group: {
          _id: "$_id",
          count: { $sum: { $size: "$descendantFiles" } },
        },
      },
    ];

    const results: { _id: string; count: number }[] = await db.TagModel.aggregate(pipeline);

    const dateModified = dayjs().toISOString();
    await Promise.all(
      results.map(({ _id, count }) =>
        db.TagModel.updateOne({ _id }, { $set: { count, dateModified } })
      )
    );

    return results;
  });

export const removeChildTagIdsFromTags = ({
  childTagIds,
  tagIds,
}: db.RemoveChildTagIdsFromTagsInput) =>
  handleErrors(async () => {
    const dateModified = dayjs().toISOString();
    return await db.TagModel.updateMany(
      { _id: { $in: tagIds } },
      { $pullAll: { childIds: childTagIds }, dateModified }
    );
  });

export const removeParentTagIdsFromTags = ({
  parentTagIds,
  tagIds,
}: db.RemoveParentTagIdsFromTagsInput) =>
  handleErrors(async () => {
    const dateModified = dayjs().toISOString();
    return await db.TagModel.updateMany(
      { _id: { $in: tagIds } },
      { $pullAll: { parentIds: parentTagIds }, dateModified }
    );
  });

export const setTagCount = ({ count, id }: db.SetTagCountInput) =>
  handleErrors(async () => {
    const dateModified = dayjs().toISOString();
    return db.TagModel.updateOne({ _id: id }, { $set: { count }, dateModified });
  });
