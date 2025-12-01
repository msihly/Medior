import { KeyboardEvent, MutableRefObject } from "react";
import FilePlayer from "react-player/file";
import { useStores } from "medior/store";
import { toast, Toaster } from "medior/utils/client";
import { Fmt, round, throttle } from "medior/utils/common";

const RATING_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

export interface UseHotkeysProps {
  rootRef?: MutableRefObject<HTMLElement>;
  videoRef?: MutableRefObject<FilePlayer>;
  view: "carousel" | "home" | "search";
}

export const useHotkeys = ({ rootRef, videoRef, view }: UseHotkeysProps) => {
  const stores = useStores();

  const toaster = new Toaster();

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
      stores.file.tagsEditor.isOpen ||
      stores.tag.editor.isOpen ||
      stores.tag.subEditor.isOpen ||
      stores.tag.merger.isOpen
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
    const hasAlt = event.altKey;
    const hasCtrl = event.ctrlKey;
    const hasShift = event.shiftKey;

    event.preventDefault();

    if (view !== "carousel" && hasCtrl && key === "a") {
      stores.file.search.toggleSelected(
        stores.file.search.results.map(({ id }) => ({ id, isSelected: true })),
      );
      toast.info(`Added ${stores.file.search.results.length} files to selection`);
    } else if (isOneFileSelected) {
      if (key === "i") {
        stores.file.setActiveFileId(fileIds[0]);
        stores.file.setIsInfoModalOpen(true);
      }

      if (["ArrowLeft", "ArrowRight"].includes(key)) {
        const isLeft = key === "ArrowLeft";
        if (view === "carousel") {
          if (hasAlt || hasCtrl || hasShift) {
            if (hasAlt) stores.carousel.setIsPlaying(false);
            const dir = isLeft ? -1 : 1;
            const frames = hasAlt ? 1 : hasShift ? 3 : 30;
            const file = stores.carousel.getActiveFile();
            const frameRate = hasAlt ? 1 : file.frameRate;
            const totalFrames = round(file.totalFrames, 0);
            const newFrame = Math.max(
              0,
              Math.min(totalFrames, round(stores.carousel.curFrame + dir * frames * frameRate, 0)),
            );

            if (file.isWebPlayable) videoRef.current?.seekTo(newFrame / totalFrames, "fraction");
            else await transcode(newFrame, file.frameRate);

            const frameDiff = round(Math.abs(newFrame - stores.carousel.curFrame), 0);
            toaster.toast(`Frame: ${newFrame} (${isLeft ? "-" : "+"}${frameDiff})`);
          } else navCarouselByArrowKey(isLeft);
        } else selectFileByArrowKey(isLeft, fileIds[0]);
      }

      if (RATING_KEYS.includes(key)) await stores.file.setFileRating({ fileIds, rating: +key });

      if (view === "carousel") {
        if (key === " ") stores.carousel.toggleIsPlaying();
        else if (["ArrowUp", "ArrowDown"].includes(key)) {
          const vol =
            key === "ArrowUp"
              ? Math.min(1, stores.carousel.volume + 0.05)
              : Math.max(0, stores.carousel.volume - 0.05);
          stores.carousel.setVolume(vol);
          stores.carousel.setLastVolume(vol);
        }
      }
    }

    if (key === "f") {
      if (isOneFileSelected) {
        const file = stores.file.getById(fileIds[0]);
        if (file.isAnimated) {
          toast.error("Cannot detect faces in animated files");
          return;
        }

        stores.faceRecog.setActiveFileId(file.id);
        stores.faceRecog.setIsModalOpen(true);
      } else stores.faceRecog.addFilesToAutoDetectQueue(fileIds);
    }

    if (key === "t") {
      stores.file.tagsEditor.setBatchId(null);
      stores.file.tagsEditor.setFileIds(fileIds);
      stores.file.tagsEditor.setIsOpen(true);
    }

    if (key === "Delete") stores.file.confirmDeleteFiles(fileIds);
  };

  const transcode = throttle(async (frame: number, frameRate: number) => {
    stores.carousel.setSeekOffset(frame);
    return await stores.carousel.transcodeVideo({
      seekTime: Fmt.frameToSec(frame, frameRate),
      onFirstFrames: () => stores.carousel.setCurFrame(frame, frameRate),
    });
  }, 400);

  return {
    handleKeyPress,
    navCarouselByArrowKey,
    selectFileByArrowKey,
  };
};
