import mongoose, { PipelineStage } from "mongoose";
import {
  AddChildTagIdsToTagsInput,
  AddParentTagIdsToTagsInput,
  CreateTagInput,
  DeleteTagInput,
  EditTagInput,
  FileImportBatchModel,
  FileModel,
  OnTagCreatedInput,
  OnTagUpdatedInput,
  RecalculateTagCountsInput,
  RegExMapModel,
  RemoveChildTagIdsFromTagsInput,
  RemoveParentTagIdsFromTagsInput,
  SetTagCountInput,
  Tag,
  TagModel,
} from "database";
import { dayjs, handleErrors, socket } from "utils";
import { leanModelToJson } from "./utils";

export const addChildTagIdsToTags = ({ childTagIds, tagIds }: AddChildTagIdsToTagsInput) =>
  handleErrors(async () => {
    const dateModified = dayjs().toISOString();
    await TagModel.updateMany(
      { _id: { $in: tagIds } },
      { $addToSet: { childIds: childTagIds as any }, dateModified }
    );
    return dateModified;
  });

export const addParentTagIdsToTags = ({ parentTagIds, tagIds }: AddParentTagIdsToTagsInput) =>
  handleErrors(async () => {
    const dateModified = dayjs().toISOString();
    await TagModel.updateMany(
      { _id: { $in: tagIds } },
      { $addToSet: { parentIds: parentTagIds as any }, dateModified }
    );
    return dateModified;
  });

export const createTag = ({ aliases = [], childIds = [], label, parentIds = [] }: CreateTagInput) =>
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

    const res = await TagModel.create(tag);
    return { ...tag, id: res._id.toString() };
  });

export const deleteTag = ({ id }: DeleteTagInput) =>
  handleErrors(async () => {
    const dateModified = dayjs().toISOString();
    const tagIds = [id];

    await Promise.all([
      await FileImportBatchModel.updateMany({ tagIds }, { $pull: { tagIds } }),
      await FileModel.updateMany({ tagIds }, { $pull: { tagIds }, dateModified }),
      await RegExMapModel.updateMany({ tagIds }, { $pull: { tagIds } }),
      await TagModel.updateMany(
        { $or: [{ childIds: id }, { parentIds: id }] },
        { $pullAll: { childIds: tagIds, parentIds: tagIds }, dateModified }
      ),
    ]);

    await TagModel.deleteOne({ _id: id });

    socket.emit("tagDeleted", { tagId: id });
  });

export const editTag = ({ aliases, childIds, id, label, parentIds }: EditTagInput) =>
  handleErrors(async () => {
    const dateModified = dayjs().toISOString();
    return await TagModel.updateOne(
      { _id: id },
      { aliases, childIds, dateModified, label, parentIds }
    );
  });

export const getAllTags = () =>
  handleErrors(async () => (await TagModel.find().lean()).map((r) => leanModelToJson<Tag>(r)));

export const onTagCreated = async ({ tag }: OnTagCreatedInput) =>
  handleErrors(async () => !!socket.emit("tagCreated", { tag }));

export const onTagUpdated = async ({ tagId, updates }: OnTagUpdatedInput) =>
  handleErrors(async () => !!socket.emit("tagUpdated", { tagId, updates }));

export const recalculateTagCounts = async ({ tagIds }: RecalculateTagCountsInput) =>
  handleErrors(async () => {
    const pipeline: PipelineStage[] = [
      {
        $match: {
          _id: { $in: tagIds.map((id) => new mongoose.Types.ObjectId(id)) },
        },
      },
      {
        $graphLookup: {
          from: "tags",
          startWith: "$_id",
          connectFromField: "_id",
          connectToField: "parentIds",
          as: "descendants",
          depthField: "depth",
        },
      },
      {
        $project: {
          descendantIds: {
            $concatArrays: [
              ["$_id"],
              {
                $map: {
                  input: "$descendants",
                  as: "descendant",
                  in: "$$descendant._id",
                },
              },
            ],
          },
        },
      },
      {
        $lookup: {
          from: "files",
          localField: "descendantIds",
          foreignField: "tagIds",
          as: "descendantFiles",
        },
      },
      {
        $project: {
          _id: 0,
          id: "$_id",
          count: {
            $size: "$descendantFiles",
          },
        },
      },
    ];

    const results: { count: number; id: string }[] = await TagModel.aggregate(pipeline);
    const dateModified = dayjs().toISOString();

    await Promise.all(
      results.map(({ count, id }) =>
        TagModel.updateOne({ _id: id }, { $set: { count, dateModified } })
      )
    );

    return results;
  });

export const removeChildTagIdsFromTags = ({
  childTagIds,
  tagIds,
}: RemoveChildTagIdsFromTagsInput) =>
  handleErrors(async () => {
    const dateModified = dayjs().toISOString();
    return await TagModel.updateMany(
      { _id: { $in: tagIds } },
      { $pullAll: { childIds: childTagIds }, dateModified }
    );
  });

export const removeParentTagIdsFromTags = ({
  parentTagIds,
  tagIds,
}: RemoveParentTagIdsFromTagsInput) =>
  handleErrors(async () => {
    const dateModified = dayjs().toISOString();
    return await TagModel.updateMany(
      { _id: { $in: tagIds } },
      { $pullAll: { parentIds: parentTagIds }, dateModified }
    );
  });

export const setTagCount = ({ count, id }: SetTagCountInput) =>
  handleErrors(async () => {
    const dateModified = dayjs().toISOString();
    return TagModel.updateOne({ _id: id }, { $set: { count }, dateModified });
  });
