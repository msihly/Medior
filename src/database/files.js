import { promises as fs, constants as fsc } from "fs";
import md5File from "md5-file";
import db from "./";
import { addFileTags, getFileTags } from "./tags";
import { mysqlDateTime } from "utils";

export const archiveImages = async (fileIds, unarchive = false) => {
  if (!fileIds?.length) return false;

  try {
    // prettier-ignore
    const sql =
      `UPDATE files AS f
      SET f.archived = ${unarchive ? 0 : 1}
      WHERE f.fileId IN (?${", ?".repeat(fileIds.length - 1)})`;
    await db.query(sql, fileIds);
    return true;
  } catch (e) {
    return console.error(e);
  }
};

export const copyFileTo = async (fileObj, targetDir) => {
  const { path: originalPath, name, extension: ext, size } = fileObj;

  const hash = await md5File(originalPath);
  const dirPath = `${targetDir}\\${hash.substr(0, 2)}\\${hash.substr(2, 2)}`;
  const path = `${dirPath}\\${hash}.${originalPath.split(".").pop()}`;
  const dateCreated = mysqlDateTime();

  const image = { originalPath, path, name, ext, size, dateCreated };

  try {
    await fs.mkdir(dirPath, { recursive: true });
    await fs.copyFile(originalPath, path, fsc.COPYFILE_EXCL);

    const fields = [
      "originalName",
      "path",
      "originalPath",
      "fileHash",
      "size",
      "ext",
      "dateCreated",
    ];
    const values = [name, path, originalPath, hash, size, ext, dateCreated];
    const sql = `INSERT INTO files (${fields.join(", ")}) VALUES (?${", ?".repeat(fields.length - 1)});`; //prettier-ignore
    const [{ insertId: fileId }] = await db.query(sql, values);

    const tagIds = await addFileTags([fileId], ["Untagged"]);
    if (!tagIds) throw new Error("Failed to add tags in addFileTags");

    return { ...image, fileId, tags: ["Untagged"], isDuplicate: false };
  } catch (e) {
    if (e.code === "EEXIST") {
      const [images,] = await db.query(`SELECT f.fileId FROM files AS f WHERE f.fileHash = ?;`, [hash]); //prettier-ignore

      return { ...image, fileId: images[0].fileId, isDuplicate: true };
    } else return console.error(e);
  }
};

export const deleteImages = async (fileIds) => {
  if (!fileIds?.length) return false;

  try {
    const sql = `DELETE FROM files WHERE fileId IN (?${", ?".repeat(fileIds.length - 1)})`;
    await db.query(sql, fileIds);
    return true;
  } catch (e) {
    return console.error(e);
  }
};

export const getImages = async () => {
  try {
    const sql = `SELECT * FROM files`;
    const [images] = await db.query(sql);

    if (images.length > 0) {
      const tags = await getFileTags(images.map((f) => f.fileId));
      images.forEach((f) => {
        f.tags = tags.filter((t) => f.fileId === t.fileId).map((t) => t.tagText);
      });
    }

    return images;
  } catch (e) {
    return console.error(e);
  }
};

export const updateDateModified = async (fileIds = []) => {
  if (!fileIds?.length) return false;

  const dateModified = mysqlDateTime();
  // prettier-ignore
  const sql =
    `UPDATE files
    SET dateModified = ?
    WHERE fileId IN (?${", ?".repeat(fileIds.length - 1)});`
  await db.query(sql, [dateModified, ...fileIds]);

  return dateModified;
};
