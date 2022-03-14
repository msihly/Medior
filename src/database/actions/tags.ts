import { TagModel } from "database";

export const createTag = async ({ aliases = [], label, parentIds = [], tagStore }) => {
  try {
    const tag = (await TagModel.create({ aliases, label, parentIds })).toJSON();
    tagStore.createTag(tag);

    return { success: true, tag };
  } catch (err) {
    console.error(err?.message ?? err);
    return { success: false, error: err?.message ?? err };
  }
};

export const editTag = async ({ aliases, id, label, parentIds, tagStore }) => {
  try {
    await TagModel.updateOne({ _id: id }, { aliases, label, parentIds });
    tagStore.getById(id).update({ aliases, label, parentIds });

    return true;
  } catch (err) {
    console.error(err?.message ?? err);
    return false;
  }
};

export const getAllTags = async () => {
  try {
    const tags = (await TagModel.find()).map((r) => r.toJSON());
    return tags;
  } catch (err) {
    console.error(err?.message ?? err);
    return [];
  }
};
