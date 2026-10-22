import { ipcRenderer } from "electron";
import { FileSchema } from "medior/server/database";

export const openCarouselWindow = async ({
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

export const openSearchWindow = async ({ tagIds }: { tagIds?: string[] } = {}) =>
  ipcRenderer.send("createSearchWindow", {
    tagIds: tagIds?.length ? [...tagIds] : [],
  });
