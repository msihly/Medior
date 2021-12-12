import { types } from "store/actions";
import { uniqueArrayMerge } from "utils";

const defaultState = [];

export const images = (state = defaultState, action) => {
  switch (action.type) {
    case types.IMAGES_ADDED: {
      const images = action.payload.images.map((img) => ({
        ...img,
        isDisplayed: true,
        isSelected: false,
      }));
      return [...state, ...images];
    }
    case types.IMAGES_ARCHIVED: {
      const { fileIds } = action.payload;
      return state.map((img) => (fileIds.includes(img.fileId) ? { ...img, archived: 1 } : img));
    }
    case types.IMAGES_DELETED: {
      const { fileIds } = action.payload;
      return state.filter((img) => !fileIds.includes(img.fileId));
    }
    case types.IMAGES_UNARCHIVED: {
      const { fileIds } = action.payload;
      return state.map((img) => (fileIds.includes(img.fileId) ? { ...img, archived: 0 } : img));
    }
    case types.IMAGES_UPDATED: {
      const { images } = action.payload;
      return state.map((img) => {
        const updated = images.find((i) => i.fileId === img.fileId);
        return updated ? { ...img, ...updated } : img;
      });
    }
    case types.TAGS_UPDATED: {
      const { fileIds, addedTags, removedTags, dateModified } = action.payload;
      return state.map((f) =>
        fileIds.includes(f.fileId)
          ? {
              ...f,
              tags: uniqueArrayMerge(f.tags, addedTags).filter((tag) => !removedTags.includes(tag)),
              dateModified,
            }
          : f
      );
    }
    case types.RESET: {
      return defaultState;
    }
    default: {
      return state;
    }
  }
};
