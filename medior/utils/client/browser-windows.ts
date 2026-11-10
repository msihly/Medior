import { ipcRenderer } from "electron";
import { derefMobx } from "trabecula/utils/client";
import { FileSchema } from "medior/server/database";
import type { HomeViewRequest } from "medior/store";

export const openCarouselWindow = ({
  file,
  selectedFileIds,
  startTimes,
}: {
  file: FileSchema;
  selectedFileIds: string[];
  /** Seconds each video starts playing at, by file ID. */
  startTimes?: Record<string, number>;
}) =>
  ipcRenderer.send("createCarouselWindow", {
    fileId: file.id,
    height: file.height,
    selectedFileIds: [...selectedFileIds],
    startTimes: { ...startTimes },
    width: file.width,
  });

/** Shows a view in the main window, which comes to the front, from this or any other window. */
export const openHomeView = (request: HomeViewRequest) =>
  ipcRenderer.send("openHomeView", derefMobx(request));
