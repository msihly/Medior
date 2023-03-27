import { FileImportBatchModel, FileModel, Tag, TagModel } from "database";
import { toast } from "react-toastify";
import { getTagDescendants, RootStore, Tag as MobXTag, TagStore } from "store";
import { dayjs, getArrayDiff, PromiseQueue } from "utils";

export const createTag = async ({
  aliases = [],
  childIds = [],
  label,
  parentIds = [],
  rootStore,
}: {
  aliases?: string[];
  childIds?: string[];
  label: string;
  parentIds?: string[];
  rootStore: RootStore;
}): Promise<{
  error?: string;
  success: boolean;
  tag?: Tag;
}> => {
  try {
    const { tagStore } = rootStore;

    const tag = (
      await TagModel.create({ aliases, childIds, count: 0, label, parentIds })
    ).toJSON() as Tag;
    tagStore.createTag(tag);

    if (childIds?.length > 0)
      await TagModel.updateMany({ _id: { $in: childIds } }, { $addToSet: { parentIds: tag.id } });

    if (parentIds?.length > 0)
      await TagModel.updateMany({ _id: { $in: parentIds } }, { $addToSet: { childIds: tag.id } });

    tagStore.editRelatedTags({ childIds, parentIds, tagId: tag.id });

    const mobXTag = tagStore.getById(tag.id);
    await refreshRelatedTagCounts(tagStore, mobXTag);

    toast.success(`Tag '${label}' created`);
    return { success: true, tag };
  } catch (err) {
    console.error(err);
    toast.error(`Failed to create tag '${label}'`);
    return { success: false, error: err?.message };
  }
};

export const deleteTag = async ({ id, rootStore }: { id: string; rootStore: RootStore }) => {
  try {
    const { importStore, tagStore } = rootStore;

    const dateModified = dayjs().toISOString();
    const fileRes = await FileModel.updateMany(
      { tagIds: id },
      { $pull: { tagIds: id }, dateModified }
    );
    if (fileRes?.matchedCount !== fileRes?.modifiedCount)
      throw new Error("Failed to remove tag from all files");

    const importRes = await FileImportBatchModel.updateMany(
      { tagIds: id },
      { $pull: { tagIds: id } }
    );
    if (importRes?.matchedCount !== importRes?.modifiedCount)
      throw new Error("Failed to remove tag from all import batches");
    importStore.editBatchTags({ removedIds: [id] });

    const tagRes = await TagModel.updateMany({ parentIds: id }, { $pull: { parentIds: id } });
    if (tagRes?.matchedCount !== tagRes?.modifiedCount)
      throw new Error("Failed to remove parent tag from all tags");

    const tag = tagStore.getById(id);
    await refreshRelatedTagCounts(tagStore, tag);

    await TagModel.deleteOne({ _id: id });
    tagStore.deleteTag(id);

    return { success: true };
  } catch (err) {
    console.error(err);
    return { success: false, error: err?.message };
  }
};

export const editTag = async ({
  aliases,
  childIds,
  id,
  label,
  parentIds,
  rootStore,
}: {
  aliases?: string[];
  childIds?: string[];
  id: string;
  label?: string;
  parentIds?: string[];
  rootStore: RootStore;
}) => {
  try {
    const { tagStore } = rootStore;
    const tag = tagStore.getById(id);

    const [addedChildIds, removedChildIds] = getArrayDiff(tag.childIds, childIds).reduce(
      (acc, cur) => {
        if (childIds.includes(cur)) acc[0].push(cur);
        else if (tag.childIds.includes(cur)) acc[1].push(cur);
        return acc;
      },
      [[], []] as string[][]
    );

    const [addedParentIds, removedParentIds] = getArrayDiff(tag.parentIds, parentIds).reduce(
      (acc, cur) => {
        if (parentIds.includes(cur)) acc[0].push(cur);
        else if (tag.parentIds.includes(cur)) acc[1].push(cur);
        return acc;
      },
      [[], []] as string[][]
    );

    if (addedChildIds?.length > 0 || addedParentIds?.length > 0) {
      if (addedChildIds?.length > 0)
        await TagModel.updateMany(
          { _id: { $in: addedChildIds } },
          { $addToSet: { parentIds: id } }
        );
      if (addedParentIds?.length > 0)
        await TagModel.updateMany(
          { _id: { $in: addedParentIds } },
          { $addToSet: { childIds: id } }
        );
      tagStore.editRelatedTags({
        tagId: id,
        childIds: addedChildIds,
        parentIds: addedParentIds,
      });
    }

    if (removedChildIds?.length > 0 || removedParentIds?.length > 0) {
      if (removedChildIds?.length > 0)
        await TagModel.updateMany({ _id: { $in: removedChildIds } }, { $pull: { parentIds: id } });
      if (removedParentIds?.length > 0)
        await TagModel.updateMany({ _id: { $in: removedParentIds } }, { $pull: { childIds: id } });
      tagStore.editRelatedTags({
        tagId: id,
        childIds: removedChildIds,
        parentIds: removedParentIds,
        remove: true,
      });
    }

    await TagModel.updateOne({ _id: id }, { aliases, childIds, label, parentIds });
    const count = await refreshTagCount(tagStore, tag, true);
    tag.update({ aliases, childIds, count, label, parentIds });

    toast.success("Tag edited");
    return { success: true };
  } catch (err) {
    console.error(err);
    toast.error("Failed to edit tag");
    return { success: false };
  }
};

export const getAllTags = async () => {
  try {
    const tags = (await TagModel.find()).map((r) => r.toJSON() as Tag);
    return tags;
  } catch (err) {
    console.error(err);
    return [];
  }
};

export const refreshTagCount = async (tagStore: TagStore, tag: MobXTag, withRelated = false) => {
  try {
    const descendants = getTagDescendants(tagStore, tag);
    const count = (await FileModel.find({ tagIds: { $in: [tag.id, ...descendants] } })).length;

    await TagModel.updateOne({ _id: tag.id }, { $set: { count } });
    if (withRelated) await refreshRelatedTagCounts(tagStore, tag);

    return count;
  } catch (err) {
    console.error(err);
    return null;
  }
};

export const TagCountsRefreshQueue = new PromiseQueue();

export const refreshAllTagCounts = async (rootStore: RootStore, silent = false) => {
  try {
    const { tagStore } = rootStore;

    let completedCount = 0;
    const totalCount = tagStore.tags.length;

    const toastId = silent
      ? null
      : toast.info(() => `Refreshed ${completedCount} tag counts...`, {
          autoClose: false,
        });

    tagStore.tags.map((t) =>
      TagCountsRefreshQueue.add(async () => {
        await refreshTagCount(tagStore, t);

        completedCount++;
        const isComplete = completedCount === totalCount;

        if (isComplete) {
          const tags = await getAllTags();
          tagStore.overwrite(tags);
        }

        if (toastId)
          toast.update(toastId, {
            autoClose: isComplete ? 5000 : false,
            render: `Refreshed ${completedCount} tag counts${isComplete ? "." : "..."}`,
          });
      })
    );
  } catch (err) {
    console.error(err);
    return null;
  }
};

export const refreshRelatedTagCounts = async (tagStore: TagStore, tag: MobXTag) => {
  try {
    const relatedTags = [...tagStore.getChildTags(tag), ...tagStore.getParentTags(tag)];
    await Promise.all(
      relatedTags.map(async (t) => {
        const count = await refreshTagCount(tagStore, t);
        t.update({ count });
      })
    );
  } catch (err) {
    console.error(err);
    return null;
  }
};

export const refreshTagRelations = async (tagStore: TagStore, id: string) => {
  try {
    const tag = tagStore.getById(id);

    const [childTagsToAdd, childTagsToRemove] = tagStore.getChildTags(tag).reduce(
      (acc, cur) => {
        if (!tagStore.getById(cur.id)) {
          acc[1].push(cur.id);
          return acc;
        }
        if (!cur.parentIds.includes(id)) acc[0].push(cur.id);
        return acc;
      },
      [[], []] as string[][]
    );

    await TagModel.updateMany({ _id: { $in: childTagsToAdd } }, { $addToSet: { parentIds: id } });
    await TagModel.updateMany({ _id: id }, { $pullAll: { parentIds: childTagsToRemove } });

    const [parentTagsToAdd, parentTagsToRemove] = tagStore.getParentTags(tag).reduce(
      (acc, cur) => {
        if (!tagStore.getById(cur.id)) {
          acc[1].push(cur.id);
          return acc;
        }
        if (!cur.childIds.includes(id)) acc[0].push(cur.id);
        return acc;
      },
      [[], []] as string[][]
    );

    await TagModel.updateMany({ _id: { $in: parentTagsToAdd } }, { $addToSet: { childIds: id } });
    await TagModel.updateMany({ _id: id }, { $pullAll: { childIds: parentTagsToRemove } });

    return { childTagsToAdd, childTagsToRemove, parentTagsToAdd, parentTagsToRemove };
  } catch (err) {
    console.error(err);
    return null;
  }
};

export const TagRelationsRefreshQueue = new PromiseQueue();

export const refreshAllTagRelations = async (tagStore: TagStore) => {
  try {
    let completedCount = 0;
    const totalCount = tagStore.tags.length;

    const toastId = toast.info(() => `Refreshed ${completedCount} tag relations...`, {
      autoClose: false,
    });

    tagStore.tags.map((t) =>
      TagRelationsRefreshQueue.add(async () => {
        await refreshTagRelations(tagStore, t.id);

        completedCount++;
        const isComplete = completedCount === totalCount;

        if (isComplete) {
          const tags = await getAllTags();
          tagStore.overwrite(tags);
        }

        toast.update(toastId, {
          autoClose: isComplete ? 5000 : false,
          render: `Refreshed ${completedCount} tag relations${isComplete ? "." : "..."}`,
        });
      })
    );
  } catch (err) {
    console.error(err);
    return null;
  }
};
