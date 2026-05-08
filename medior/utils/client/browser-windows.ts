import { FileSchema } from "medior/server/database";

export const openCarouselWindow = async ({
  file,
  selectedFileIds,
}: {
  file: FileSchema;
  selectedFileIds: string[];
}) =>
  (await import("electron")).ipcRenderer.send("createCarouselWindow", {
    fileId: file.id,
    height: file.height,
    selectedFileIds: [...selectedFileIds],
    width: file.width,
  });

export const openSearchWindow = async ({ tagIds }: { tagIds?: string[] } = {}) =>
  (await import("electron")).ipcRenderer.send("createSearchWindow", {
    tagIds: tagIds?.length ? [...tagIds] : [],
  });
