import { types } from "store/actions";
import * as db from "database";
import { toast } from "react-toastify";

/* ---------------------------- PLAIN ACTIONS ---------------------------- */
export const tagsUpdated = (fileIds, addedTags, removedTags, dateModified) => ({
  type: types.TAGS_UPDATED,
  payload: { fileIds, addedTags, removedTags, dateModified },
});

/* --------------------------------- THUNKS --------------------------------- */
export const editTags = (fileIds, addedTags, removedTags) => async (dispatch) => {
  try {
    const dateModified = await db.editFileTags(fileIds, addedTags, removedTags);
    dispatch(tagsUpdated(fileIds, addedTags, removedTags, dateModified));

    toast.success("Tags updated");
    return { success: true };
  } catch (err) {
    return { success: false, error: err };
  }
};
