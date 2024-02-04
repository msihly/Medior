import { useEffect } from "react";
import { useStores } from "store";
import { setupSocketIO, socket } from "utils";

export interface UseSocketsProps {
  view: "carousel" | "home" | "search";
}

export const useSockets = ({ view }: UseSocketsProps) => {
  const rootStore = useStores();
  const { carouselStore, fileCollectionStore, fileStore, homeStore, importStore, tagStore } =
    useStores();

  useEffect(() => {
    setupSocketIO();

    socket.on("filesDeleted", ({ fileIds }) => {
      if (view === "carousel") carouselStore.removeFiles(fileIds);
      else {
        fileCollectionStore.loadCollections();
        homeStore.reloadDisplayedFiles({ rootStore });
      }
    });

    socket.on("filesUpdated", ({ fileIds, updates }) => {
      fileStore.updateFiles(fileIds, updates);
      if (view !== "carousel") homeStore.reloadDisplayedFiles({ rootStore });
    });

    socket.on("fileTagsUpdated", ({ addedTagIds, batchId, fileIds, removedTagIds }) => {
      fileStore.updateFileTags({ addedTagIds, fileIds, removedTagIds });

      if (view !== "carousel") homeStore.reloadDisplayedFiles({ rootStore });

      if (view === "home" && batchId?.length > 0)
        importStore.editBatchTags({
          addedIds: addedTagIds,
          batchIds: [batchId],
          removedIds: removedTagIds,
        });
    });

    socket.on("reloadFiles", () => {
      if (view === "carousel") fileStore.loadFiles({ fileIds: carouselStore.selectedFileIds });
      else homeStore.reloadDisplayedFiles({ rootStore });
    });

    socket.on("reloadTags", () => tagStore.loadTags());

    socket.on("tagCreated", ({ tag }) => tagStore._addTag(tag));

    socket.on("tagDeleted", ({ tagId }) => {
      if (view === "home") importStore.editBatchTags({ removedIds: [tagId] });
      if (view !== "carousel") homeStore.removeDeletedTag(tagId);
      tagStore._deleteTag(tagId);
    });

    socket.on("tagsUpdated", (tags) => {
      tags.forEach((t) => tagStore.getById(t.tagId)?.update(t.updates));
    });

    if (view === "carousel")
      socket.on("filesArchived", ({ fileIds }) => carouselStore.removeFiles(fileIds));

    if (view !== "carousel") {
      socket.on("reloadFileCollections", () => fileCollectionStore.loadCollections());
      socket.on("reloadRegExMaps", () => importStore.loadRegExMaps());
    }

    if (view === "home") socket.on("reloadImportBatches", () => importStore.loadImportBatches());
  }, []);
};
