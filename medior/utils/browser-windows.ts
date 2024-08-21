import { ipcRenderer } from "electron";
import * as db from "medior/database";

export const openCarouselWindow = ({
  file,
  selectedFileIds,
}: {
  file: db.FileSchema;
  selectedFileIds: string[];
}) =>
  ipcRenderer.send("createCarouselWindow", {
    fileId: file.id,
    height: file.height,
    selectedFileIds,
    width: file.width,
  });

export const openSearchWindow = ({ tagIds }: { tagIds?: string[] } = {}) =>
  ipcRenderer.send("createSearchWindow", { tagIds: tagIds?.length ? [...tagIds] : [] });
