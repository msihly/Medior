import { ipcRenderer } from "electron";
import { FileSchema } from "medior/database";

export const openCarouselWindow = ({
  file,
  selectedFileIds,
}: {
  file: FileSchema;
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
