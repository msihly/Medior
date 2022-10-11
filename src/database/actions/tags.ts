import { FileImportBatchModel, FileModel, Tag, TagModel } from "database";
import { TagStore } from "store/tags";

interface CreateTagProps {
  aliases?: string[];
  label: string;
  parentIds?: string[];
}

interface CreateTagResult {
  error?: string;
  success: boolean;
  tag?: Tag;
}

export const createTag = async ({
  aliases = [],
  label,
  parentIds = [],
}: CreateTagProps): Promise<CreateTagResult> => {
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

    await TagModel.deleteOne({ _id: id });

    return { success: true };
  } catch (err) {
    console.error(err);
    return { success: false, error: err?.message };
  }
};

interface EditTagProps {
  aliases?: string[];
  id: string;
  label?: string;
  parentIds?: string[];
}

export const editTag = async ({ aliases, id, label, parentIds }: EditTagProps) => {
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
