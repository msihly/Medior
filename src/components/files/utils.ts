import { ipcRenderer } from "electron";
import { File } from "database";

export const openFile = ({ file, selectedFileIds }: { file: File; selectedFileIds: string[] }) =>
  ipcRenderer.send("createCarouselWindow", {
    fileId: file.id,
    height: file.height,
    selectedFileIds,
    width: file.width,
  });
