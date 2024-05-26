import { ipcRenderer } from "electron";
import { File } from "database";

export const openCarouselWindow = ({
  file,
  selectedFileIds,
}: {
  file: File;
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
