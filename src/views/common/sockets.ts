import { useEffect } from "react";
import { useStores } from "store";
import { setupSocketIO, socket } from "utils";

export interface UseSocketsProps {
  view: "carousel" | "home" | "search";
}

export const useSockets = ({ view }: UseSocketsProps) => {
  const debug = false;

  const { carouselStore, fileCollectionStore, fileStore, homeStore, importStore, tagStore } =
    useStores();

  const setupSockets = () => {
    setupSocketIO();

    socket.on("collectionCreated", ({ collection }) => {
      if (debug) console.debug("[Socket] collectionCreated", { collection });
      if (view !== "carousel") fileCollectionStore._addCollection(collection);
    });

    socket.on("collectionDeleted", ({ collectionId }) => {
      if (debug) console.debug("[Socket] collectionDeleted", { collectionId });
      if (view !== "carousel") fileCollectionStore._deleteCollection(collectionId);
    });

    socket.on("collectionUpdated", ({ collectionId, updates }) => {
      if (debug) console.debug("[Socket] collectionUpdated", { collectionId, updates });
      if (view !== "carousel") fileCollectionStore.getById(collectionId)?.update(updates);
    });

    socket.on("filesDeleted", ({ fileHashes, fileIds }) => {
      if (debug) console.debug("[Socket] filesDeleted", { fileIds });
      if (view === "carousel") carouselStore.removeFiles(fileIds);
      else {
        if (view === "home") importStore.addDeletedFileHashes(fileHashes);
        if (fileCollectionStore.isManagerOpen) fileCollectionStore.listFilteredCollections();
        homeStore.loadFilteredFiles();
      }
    });

    socket.on("filesUpdated", ({ fileIds, updates }) => {
      if (debug) console.debug("[Socket] filesUpdated", { fileIds, updates });
      fileStore.updateFiles(fileIds, updates);

      const updatedKeys = Object.keys(updates);
      if (
        view !== "carousel" &&
        (updatedKeys.includes("tagIds") || updatedKeys.includes(homeStore.sortValue.key))
      ) {
        homeStore.loadFilteredFiles();
      }
    });

    socket.on("fileTagsUpdated", ({ addedTagIds, batchId, fileIds, removedTagIds }) => {
      if (debug)
        console.debug("[Socket] fileTagsUpdated", {
          addedTagIds,
          batchId,
          fileIds,
          removedTagIds,
        });

      fileStore.updateFileTags({ addedTagIds, fileIds, removedTagIds });

      if (view !== "carousel") homeStore.loadFilteredFiles();

      if (view === "home" && batchId?.length > 0)
        importStore.editBatchTags({
          addedIds: addedTagIds,
          batchIds: [batchId],
          removedIds: removedTagIds,
        });
    });

    socket.on("reloadFiles", () => {
      if (debug) console.debug("[Socket] reloadFiles");
      if (view === "carousel") fileStore.loadFiles({ fileIds: carouselStore.selectedFileIds });
      else homeStore.loadFilteredFiles();
    });

    socket.on("reloadTags", () => {
      if (debug) console.debug("[Socket] reloadTags");
      tagStore.loadTags();
    });

    socket.on("tagCreated", ({ tag }) => {
      if (debug) console.debug("[Socket] tagCreated", { tag });
      tagStore._addTag(tag);
    });

    socket.on("tagDeleted", ({ tagId }) => {
      if (debug) console.debug("[Socket] tagDeleted", { tagId });
      tagStore._deleteTag(tagId);
      if (view === "home") importStore.editBatchTags({ removedIds: [tagId] });
      if (view !== "carousel") {
        homeStore.removeDeletedTag(tagId);
        homeStore.loadFilteredFiles();
      }
    });

    socket.on("tagsUpdated", (tags) => {
      if (debug) console.debug("[Socket] tagsUpdated", { tags });
      tags.forEach((t) => tagStore.getById(t.tagId)?.update(t.updates));
      if (view !== "carousel") homeStore.loadFilteredFiles();
    });

    if (view === "carousel")
      socket.on("filesArchived", ({ fileIds }) => {
        if (debug) console.debug("[Socket] filesArchived", { fileIds });
        carouselStore.removeFiles(fileIds);
      });

    if (view !== "carousel") {
      socket.on("importBatchCompleted", () => {
        if (debug) console.debug("[Socket] importBatchCompleted");
        if (!importStore.isImportManagerOpen) homeStore.loadFilteredFiles();
      });

      socket.on("reloadFileCollections", () => {
        if (debug) console.debug("[Socket] reloadFileCollections");
        if (fileCollectionStore.isManagerOpen) fileCollectionStore.listFilteredCollections();
      });
    }

    if (view === "home")
      socket.on("reloadImportBatches", () => {
        if (debug) console.debug("[Socket] reloadImportBatches");
        importStore.loadImportBatches();
      });
  };

  useEffect(() => {
    setupSockets();
    return () => {
      socket.disconnect();
    };
  }, []);
};
