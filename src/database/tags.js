import db from "./";
import { updateDateModified } from "./files";

export const createTags = async (tags = [], hasLookup = false) => {
  if (!tags?.length) return false;

  const sql = `INSERT IGNORE INTO tag (tagText) VALUES (?)${", (?)".repeat(tags.length - 1)}`;
  await db.query(sql, tags);

  if (hasLookup) return await getTagIds(tags);
  return true;
};

export const getTagIds = async (tags = []) => {
  if (!tags?.length) return false;

  // prettier-ignore
  const sql =
    `SELECT t.tagId
    FROM tag AS t
    WHERE t.tagText IN (?${", ?".repeat(tags.length - 1)})`;
  const [tagIds] = await db.query(sql, tags);

  return tagIds.map((t) => t.tagId);
};

export const addFileTags = async (fileIds = [], tags = []) => {
  [fileIds, tags] = [fileIds, tags].map((arr) => arr.filter((id) => Boolean(id)));
  // console.log("fileIds", fileIds);
  // console.log("fileIds.length", !fileIds?.length);
  // console.log("tags", tags);
  if (!fileIds?.length || !tags?.length) return false;

  try {
    await db.query("START TRANSACTION");

    const tagIds = await createTags(tags, true);
    if (!tagIds?.length) throw new Error("Failed to create tags");

    const fileTags = fileIds.flatMap((fileId) => tagIds.flatMap((tagId) => [fileId, tagId]));

    // console.log("tagIds", tagIds);
    // console.log("fileTags", fileTags);

    // prettier-ignore
    const sql =
    `INSERT INTO fileTag (fileId, tagId)
      VALUES (?, ?)${", (?, ?)".repeat(fileTags.length / 2 - 1)};`;
    await db.query(sql, fileTags);

    await db.query("COMMIT");
    return tagIds;
  } catch (e) {
    await db.query("ROLLBACK");
    throw new Error(e);
  }
};

export const compareFileTags = async (fileId, tags = []) => {
  if (!fileId || tags?.length === undefined) return false;

  const fileTags = await getFileTags([fileId]);
  const currentTags = fileTags.map((t) => t.tagText);
  const addedTags = tags.filter((t) => !currentTags.includes(t));
  const removedTags = currentTags.filter((t) => !tags.includes(t));

  return { addedTags, removedTags };
};

export const editFileTags = async (
  fileIds = [],
  addedTags = [],
  removedTags = [],
  hasDate = true
) => {
  if (!fileIds?.length || (!addedTags?.length && !removedTags?.length)) return false;

  try {
    await db.query("START TRANSACTION");

    if (addedTags.length > 0) await addFileTags(fileIds, addedTags);
    if (removedTags.length > 0) await removeFileTags(fileIds, removedTags);

    if (hasDate) {
      const dateModified = await updateDateModified(fileIds);
      await db.query("COMMIT");
      return dateModified;
    } else {
      await db.query("COMMIT");
      return true;
    }
  } catch (e) {
    await db.query("ROLLBACK");
    throw new Error(e);
  }
};

export const getFileTags = async (fileIds = []) => {
  if (!fileIds?.length) return false;

  // prettier-ignore
  const sql =
    `SELECT fT.fileId, t.tagText
    FROM tag AS t INNER JOIN fileTag AS fT
      ON t.tagId = fT.tagId
    WHERE fT.fileId IN (?${", ?".repeat(fileIds.length - 1)})`;
  const [tags] = await db.query(sql, fileIds);
  return tags;
};

export const removeFileTags = async (fileIds = [], tags = []) => {
  if (!fileIds?.length || !tags?.length) return false;

  // prettier-ignore
  const sql =
    `DELETE FROM fileTag
    WHERE fileId IN (?${", ?".repeat(fileIds.length - 1)})
      AND tagId IN (
        SELECT t.tagId
        FROM tag AS t
        WHERE t.tagText IN (?${", ?".repeat(tags.length - 1)})
      )`;
  await db.query(sql, [...fileIds, ...tags]);
  return true;
};
