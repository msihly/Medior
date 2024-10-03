import { KeyboardEvent, MutableRefObject } from "react";
import { useStores } from "medior/store";
import { toast } from "react-toastify";

const RATING_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

export interface UseHotkeysProps {
  rootRef?: MutableRefObject<HTMLElement>;
  view: "carousel" | "home" | "search";
}

export const useHotkeys = ({ rootRef, view }: UseHotkeysProps) => {
  const stores = useStores();

  const navCarouselByArrowKey = (isLeft: boolean) => {
    if (
      stores.carousel.activeFileIndex === (isLeft ? 0 : stores.carousel.selectedFileIds.length - 1)
    )
      return;

    const newFileId =
      stores.carousel.selectedFileIds[stores.carousel.activeFileIndex + (isLeft ? -1 : 1)];
    stores.carousel.setActiveFileId(newFileId);
    stores.file.setActiveFileId(newFileId);

    rootRef.current?.focus();
  };

  const selectFileByArrowKey = (isLeft: boolean, selectedId: string) => {
    const indexOfSelected = stores.file.search.results.findIndex((f) => f.id === selectedId);
    const nextIndex =
      indexOfSelected === stores.file.search.results.length - 1 ? 0 : indexOfSelected + 1;
    const nextId = stores.file.search.results[nextIndex].id;
    const prevIndex =
      indexOfSelected === 0 ? stores.file.search.results.length - 1 : indexOfSelected - 1;
    const prevId = stores.file.search.results[prevIndex].id;
    const newId = isLeft ? prevId : nextId;

    if (!stores.file.search.results.find((f) => f.id === newId))
      stores.file.search.loadFiltered({
        page: stores.file.search.page + 1 * (isLeft ? -1 : 1),
      });

    stores.file.search.toggleSelected([
      { id: selectedId, isSelected: false },
      { id: newId, isSelected: true },
    ]);
  };

  const handleKeyPress = async (event: KeyboardEvent) => {
    if (
      stores.tag.isFileTagEditorOpen ||
      stores.tag.isTagEditorOpen ||
      stores.tag.isTagSubEditorOpen ||
      stores.tag.isTagMergerOpen
    )
      return;

    const fileIds =
      view === "carousel"
        ? [stores.carousel.activeFileId]
        : stores.collection.editor.isOpen
          ? [...stores.collection.editor.search.selectedIds]
          : [...stores.file.search.selectedIds];
    if (!fileIds.length) return;

    const isOneFileSelected = fileIds.length === 1;
    const key = event.key;

    event.preventDefault();

    if (view !== "carousel" && event.ctrlKey && key === "a") {
      stores.file.search.toggleSelected(
        stores.file.search.results.map(({ id }) => ({ id, isSelected: true }))
      );
      toast.info(`Added ${stores.file.search.results.length} files to selection`);
    } else if (isOneFileSelected) {
      if (key === "i") {
        stores.file.setActiveFileId(fileIds[0]);
        stores.file.setIsInfoModalOpen(true);
      }

      if (["ArrowLeft", "ArrowRight"].includes(key)) {
        const isLeft = key === "ArrowLeft";
        if (view === "carousel") navCarouselByArrowKey(isLeft);
        else selectFileByArrowKey(isLeft, fileIds[0]);
      }

      if (RATING_KEYS.includes(key)) await stores.file.setFileRating({ fileIds, rating: +key });
    }

    if (key === "f") {
      if (isOneFileSelected) {
        const file = stores.file.getById(fileIds[0]);
        if (file.isAnimated) return toast.error("Cannot detect faces in animated files");

        stores.faceRecog.setActiveFileId(file.id);
        stores.faceRecog.setIsModalOpen(true);
      } else stores.faceRecog.addFilesToAutoDetectQueue(fileIds);
    }

    if (key === "t") {
      stores.tag.setFileTagEditorBatchId(null);
      stores.tag.setFileTagEditorFileIds(fileIds);
      stores.tag.setIsFileTagEditorOpen(true);
    }

    if (key === "Delete") stores.file.confirmDeleteFiles(fileIds);
  };

  return {
    handleKeyPress,
    navCarouselByArrowKey,
    selectFileByArrowKey,
  };
};
