import { FileImportBatchModel, FileModel, Tag, TagModel } from "database";

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
