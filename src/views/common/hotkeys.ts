import { KeyboardEvent, MutableRefObject } from "react";
import { useStores } from "store";
import { toast } from "react-toastify";

const RATING_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

export interface UseHotkeysProps {
  rootRef?: MutableRefObject<HTMLElement>;
  view: "carousel" | "home" | "search";
}

export const useHotkeys = ({ rootRef, view }: UseHotkeysProps) => {
  const rootStore = useStores();
  const { carouselStore, faceRecognitionStore, fileStore, homeStore, tagStore } = useStores();

  const navCarouselByArrowKey = (isLeft: boolean) => {
    if (carouselStore.activeFileIndex === (isLeft ? 0 : carouselStore.selectedFileIds.length - 1))
      return;

    const newFileId =
      carouselStore.selectedFileIds[carouselStore.activeFileIndex + (isLeft ? -1 : 1)];
    carouselStore.setActiveFileId(newFileId);
    fileStore.setActiveFileId(newFileId);

    rootRef.current?.focus();
  };

  const selectFileByArrowKey = (isLeft: boolean, selectedId: string) => {
    const indexOfSelected = fileStore.files.findIndex((f) => f.id === selectedId);
    const nextIndex = indexOfSelected === fileStore.files.length - 1 ? 0 : indexOfSelected + 1;
    const nextId = fileStore.files[nextIndex].id;
    const prevIndex = indexOfSelected === 0 ? fileStore.files.length - 1 : indexOfSelected - 1;
    const prevId = fileStore.files[prevIndex].id;
    const newId = isLeft ? prevId : nextId;

    if (!fileStore.files.find((f) => f.id === newId))
      homeStore.loadFilteredFiles({
        page: fileStore.page + 1 * (isLeft ? -1 : 1),
      });

    fileStore.toggleFilesSelected([
      { id: selectedId, isSelected: false },
      { id: newId, isSelected: true },
    ]);
  };

  const handleKeyPress = async (event: KeyboardEvent) => {
    if (tagStore.isTaggerOpen || tagStore.isTagEditorOpen) return;

    const fileIds = view === "carousel" ? [carouselStore.activeFileId] : [...fileStore.selectedIds];
    if (!fileIds.length) return;

    const isOneFileSelected = fileIds.length === 1;
    const key = event.key;

    event.preventDefault();

    if (view !== "carousel" && event.ctrlKey && key === "a") {
      fileStore.toggleFilesSelected(fileStore.files.map(({ id }) => ({ id, isSelected: true })));
      toast.info(`Added ${fileStore.files.length} files to selection`);
    } else if (isOneFileSelected) {
      if (key === "i") {
        fileStore.setActiveFileId(fileIds[0]);
        fileStore.setIsInfoModalOpen(true);
      }

      if (["ArrowLeft", "ArrowRight"].includes(key)) {
        const isLeft = key === "ArrowLeft";
        if (view === "carousel") navCarouselByArrowKey(isLeft);
        else selectFileByArrowKey(isLeft, fileIds[0]);
      }

      if (RATING_KEYS.includes(key)) await fileStore.setFileRating({ fileIds, rating: +key });
    }

    if (key === "f") {
      if (isOneFileSelected) {
        const file = fileStore.getById(fileIds[0]);
        if (file.isAnimated) return toast.error("Cannot detect faces in animated files");

        faceRecognitionStore.setActiveFileId(file.id);
        faceRecognitionStore.setIsModalOpen(true);
      } else faceRecognitionStore.addFilesToAutoDetectQueue({ fileIds, rootStore });
    }

    if (key === "t") {
      tagStore.setTaggerBatchId(null);
      tagStore.setTaggerFileIds(fileIds);
      tagStore.setIsTaggerOpen(true);
    }

    if (key === "Delete") fileStore.confirmDeleteFiles(fileIds);
  };

  return {
    handleKeyPress,
    navCarouselByArrowKey,
    selectFileByArrowKey,
  };
};
