import { FileImportBatchModel, FileModel, Tag, TagModel } from "database";
import { TagStore } from "store";

export const createTag = async ({
  aliases = [],
  label,
  parentIds = [],
}: {
  aliases?: string[];
  label: string;
  parentIds?: string[];
}): Promise<{
  error?: string;
  success: boolean;
  tag?: Tag;
}> => {
  try {
    const tag = (await TagModel.create({ aliases, label, parentIds })).toJSON() as Tag;
    return { success: true, tag };
  } catch (err) {
    console.error(err);
    return { success: false, error: err?.message };
  }
};

export const deleteTag = async (id: string) => {
  try {
    const fileRes = await FileModel.updateMany({ tagIds: id }, { $pull: { tagIds: id } });
    if (fileRes?.matchedCount !== fileRes?.modifiedCount)
      throw new Error("Failed to remove tag from all files");

    const importRes = await FileImportBatchModel.updateMany(
      { tagIds: id },
      { $pull: { tagIds: id } }
    );
    if (importRes?.matchedCount !== importRes?.modifiedCount)
      throw new Error("Failed to remove tag from all import batches");

    const tagRes = await TagModel.updateMany({ parentIds: id }, { $pull: { parentIds: id } });
    if (tagRes?.matchedCount !== tagRes?.modifiedCount)
      throw new Error("Failed to remove parent tag from all tags");

    await TagModel.deleteOne({ _id: id });

    return { success: true };
  } catch (err) {
    console.error(err);
    return { success: false, error: err?.message };
  }
};

export const editTag = async ({
  aliases,
  id,
  label,
  parentIds,
}: {
  aliases?: string[];
  id: string;
  label?: string;
  parentIds?: string[];
}) => {
  try {
    await TagModel.updateOne({ _id: id }, { aliases, label, parentIds });
    return { success: true };
  } catch (err) {
    console.error(err);
    return { success: false };
  }
};

export const getAllTags = async () => {
  try {
    const tags = (await TagModel.find()).map((r) => r.toJSON() as Tag);
    return tags;
  } catch (err) {
    console.error(err?.message ?? err);
    return [];
  }
};

export const watchTagModel = (tagStore: TagStore) => {
  TagModel.watch().on("change", (data: any) => {
    const id = Buffer.from(data.documentKey?._id).toString();
    console.debug(`[Tag] ${id}:`, data);

    switch (data.operationType) {
      case "delete":
        if (tagStore.activeTagId === id) tagStore.setActiveTagId(null);
        if (tagStore.isTaggerOpen) tagStore.setTaggerMode("edit");
        if (tagStore.isTagManagerOpen) tagStore.setTagManagerMode("search");
        tagStore.deleteTag(id);
        break;
      case "insert":
        tagStore.createTag({ ...data.fullDocument, id, _id: undefined, __v: undefined });
        break;
      case "update":
        tagStore.getById(id).update(data.updateDescription?.updatedFields);
        break;
    }
  });
};
