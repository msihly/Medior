import { ipcRenderer } from "electron";
import { FileSchema } from "medior/server/database";

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
    selectedFileIds: [...selectedFileIds],
    width: file.width,
  });

export const openSearchWindow = ({ tagIds }: { tagIds?: string[] } = {}) =>
  ipcRenderer.send("createSearchWindow", { tagIds: tagIds?.length ? [...tagIds] : [] });
