import { ipcRenderer } from "electron";
import { File } from "database";
import { centeredSlice } from "utils";

export const openFile = ({ file, filteredFileIds }: { file: File; filteredFileIds: string[] }) =>
  ipcRenderer.send("createCarouselWindow", {
    fileId: file.id,
    height: file.height,
    selectedFileIds: centeredSlice(filteredFileIds, filteredFileIds.indexOf(file.id), 2000),
    width: file.width,
  });
