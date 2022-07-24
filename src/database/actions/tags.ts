import { Tag, TagModel } from "database";
import { TagStore } from "store/tags";

interface CreateTagProps {
  aliases?: string[];
  label: string;
  parentIds?: string[];
  tagStore: TagStore;
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
  tagStore,
}: CreateTagProps): Promise<CreateTagResult> => {
  try {
    const tag = (await TagModel.create({ aliases, label, parentIds })).toJSON() as Tag;
    tagStore.createTag(tag);

    return { success: true, tag };
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
  tagStore: TagStore;
}

interface EditTagResult {
  success: boolean;
}

export const editTag = async ({
  aliases,
  id,
  label,
  parentIds,
  tagStore,
}: EditTagProps): Promise<EditTagResult> => {
  try {
    await TagModel.updateOne({ _id: id }, { aliases, label, parentIds });
    tagStore.getById(id).update({ aliases, label, parentIds });

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
