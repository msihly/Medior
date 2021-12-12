import { types } from "store/actions";
import { promises as fs } from "fs";
import * as db from "database";
import { toast } from "react-toastify";
import { splitArray } from "utils";

/* ---------------------------- PLAIN ACTIONS ---------------------------- */
export const imagesAdded = (images) => ({
  type: types.IMAGES_ADDED,
  payload: { images },
});

export const imagesArchived = (fileIds) => ({
  type: types.IMAGES_ARCHIVED,
  payload: { fileIds },
});

export const imagesDeleted = (fileIds) => ({
  type: types.IMAGES_DELETED,
  payload: { fileIds },
});

export const imagesUnarchived = (fileIds) => ({
  type: types.IMAGES_UNARCHIVED,
  payload: { fileIds },
});

export const imagesUpdated = (images) => ({
  type: types.IMAGES_UPDATED,
  payload: { images },
});

/* --------------------------------- THUNKS --------------------------------- */
export const deleteImages = (images) => async (dispatch) => {
  const [deleted, archived] = splitArray(images, (img) => img.archived === 1);
  const [deletedIds, archivedIds] = [deleted, archived].map((arr) => arr.map((img) => img.fileId));
  const deletedPaths = deleted.map((img) => img.path);
  await Promise.all([
    db.archiveImages(archivedIds),
    db.deleteImages(deletedIds),
    deletedPaths.map((path) => fs.unlink(path)),
  ]);

  dispatch(imagesArchived(archivedIds));
  dispatch(imagesDeleted(deletedIds));
  if (archivedIds.length > 0) toast.warning(`Archived ${archivedIds.length} images`);
  if (deletedIds.length > 0) toast.error(`Deleted ${deletedIds.length} images`);
};

export const unarchiveImages = (images) => async (dispatch) => {
  const fileIds = images.map((img) => img.fileId);
  await db.archiveImages(fileIds, true);

  dispatch(imagesUnarchived(fileIds));
  if (fileIds.length > 0) toast.info(`Unarchived ${fileIds.length} images`);
};
