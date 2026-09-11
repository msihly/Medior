import { KeyboardEvent, MutableRefObject } from "react";
import FilePlayer from "react-player/file";
import { useStores } from "medior/store";
import { persistNotification, toast, Toaster } from "medior/utils/client";
import { dayjs, Fmt, getHotkeyRating, matchesHotkey, round, throttle } from "medior/utils/common";

export interface UseHotkeysProps {
  rootRef?: MutableRefObject<HTMLElement>;
  videoRef?: MutableRefObject<FilePlayer>;
  view: "carousel" | "collectionEditor" | "home" | "search";
}

export const useHotkeys = ({ rootRef, videoRef, view }: UseHotkeysProps) => {
  const stores = useStores();

  const toaster = new Toaster();

  const handleKeyPress = async (event: KeyboardEvent) => {
    if (
      stores.file.tagsEditor.isOpen ||
      stores.tag.editor.isOpen ||
      stores.tag.subEditor.isOpen ||
      stores.tag.merger.isOpen
    )
      return;

    const searchStore =
      view === "collectionEditor" ? stores.collection.editor.search : stores.file.search;
    const fileIds =
      view === "carousel" ? [stores.carousel.activeFileId] : [...searchStore.selectedIds];
    if (!fileIds.length) return;

    const hotkeys = stores.home.settings.hotkeys[view];
    const isOneFileSelected = fileIds.length === 1;
    const rating = getHotkeyRating(event, hotkeys);

    event.preventDefault();

    if (view !== "carousel" && matchesHotkey(event, stores.home.settings.hotkeys[view].selectAll)) {
      searchStore.toggleSelected(searchStore.results.map(({ id }) => ({ id, isSelected: true })));
      toast.info(`Added ${searchStore.results.length} files to selection`);
    } else if (isOneFileSelected) {
      if (matchesHotkey(event, hotkeys.fileInfo)) {
        stores.file.setActiveFileId(fileIds[0]);
        stores.file.setIsInfoModalOpen(true);
      }

      const isPreviousFile = matchesHotkey(event, hotkeys.previousFile);
      const isNextFile = matchesHotkey(event, hotkeys.nextFile);
      if (isPreviousFile || isNextFile) {
        if (view === "carousel" && !stores.carousel.splicer.isOpen)
          navCarouselByArrowKey(isPreviousFile);
        else if (view !== "carousel") selectFileByArrowKey(isPreviousFile, fileIds[0], searchStore);
      }

      if (rating) await stores.file.setFileRating({ fileIds, rating });

      if (view === "carousel") {
        const carouselHotkeys = stores.home.settings.hotkeys.carousel;
        const isPreviousFrame = matchesHotkey(event, carouselHotkeys.previousFrame);
        const isNextFrame = matchesHotkey(event, carouselHotkeys.nextFrame);
        const isSeekBackward3 = matchesHotkey(event, carouselHotkeys.seekBackward3Seconds);
        const isSeekBackward30 = matchesHotkey(event, carouselHotkeys.seekBackward30Seconds);
        const isSeekForward3 = matchesHotkey(event, carouselHotkeys.seekForward3Seconds);
        const isSeekForward30 = matchesHotkey(event, carouselHotkeys.seekForward30Seconds);

        if (matchesHotkey(event, carouselHotkeys.playPause)) stores.carousel.toggleIsPlaying();
        else if (isPreviousFrame || isNextFrame)
          await seekVideoByHotkey(isPreviousFrame, { frameRate: 1, pause: true, seconds: 1 });
        else if (isSeekBackward3 || isSeekForward3)
          await seekVideoByHotkey(isSeekBackward3, { seconds: 3 });
        else if (isSeekBackward30 || isSeekForward30)
          await seekVideoByHotkey(isSeekBackward30, { seconds: 30 });
        else {
          const isVolumeUp = matchesHotkey(event, carouselHotkeys.volumeUp);
          const isVolumeDown = matchesHotkey(event, carouselHotkeys.volumeDown);
          if (isVolumeUp || isVolumeDown) {
            const vol = isVolumeUp
              ? Math.min(1, stores.carousel.volume + 0.05)
              : Math.max(0, stores.carousel.volume - 0.05);
            stores.carousel.setVolumePreference(vol);
          }
        }
      }
    }

    if (matchesHotkey(event, hotkeys.detectFaces)) {
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

    if (matchesHotkey(event, hotkeys.editTags)) {
      stores.file.tagsEditor.setBatchId(null);
      stores.file.tagsEditor.setFileIds(fileIds);
      stores.file.tagsEditor.setIsOpen(true);
    }

    if (
      view !== "collectionEditor" &&
      matchesHotkey(event, stores.home.settings.hotkeys[view].deleteFiles)
    )
      stores.file.confirmDeleteFiles(fileIds);
  };

  const navCarouselByArrowKey = (isLeft: boolean) => {
    const oldIndex = stores.carousel.activeFileIndex;
    const newIndex = oldIndex + (isLeft ? -1 : 1);
    if (newIndex < 0 || newIndex >= stores.carousel.selectedFileIds.length) return;

    const newFileId = stores.carousel.selectedFileIds[newIndex];
    stores.carousel.setActiveFileId(newFileId);
    stores.file.setActiveFileId(newFileId);

    rootRef.current?.focus();
  };

  const seekVideoByHotkey = async (
    isLeft: boolean,
    { frameRate, pause = false, seconds }: { frameRate?: number; pause?: boolean; seconds: number },
  ) => {
    if (pause) stores.carousel.setIsPlaying(false);
    const file = stores.carousel.getActiveFile();
    const totalFrames = round(file.totalFrames, 0);

    const dir = isLeft ? -1 : 1;
    const newFrame = Math.max(
      0,
      Math.min(
        totalFrames,
        round(stores.carousel.curFrame + dir * seconds * (frameRate ?? file.frameRate), 0),
      ),
    );

    const newTime = Fmt.frameToSec(newFrame, file.frameRate);
    const timeDiff = round(newTime - stores.carousel.curTime);
    const newPercent = round((newFrame / totalFrames) * 100, 0);

    if (file.isWebPlayable) videoRef.current?.seekTo(newFrame / totalFrames, "fraction");
    else await transcode(newFrame, file.frameRate);

    const message = `${isLeft ? "-" : "+"}${timeDiff} sec. / ${dayjs.duration(newTime, "s").format("HH:mm:ss")} (${newPercent}%)`;
    persistNotification(message, "info");
    toaster.toast(message);
  };

  const selectFileByArrowKey = (
    isLeft: boolean,
    selectedId: string,
    searchStore: typeof stores.file.search,
  ) => {
    const indexOfSelected = searchStore.results.findIndex((f) => f.id === selectedId);
    const nextIndex = indexOfSelected === searchStore.results.length - 1 ? 0 : indexOfSelected + 1;
    const nextId = searchStore.results[nextIndex].id;
    const prevIndex = indexOfSelected === 0 ? searchStore.results.length - 1 : indexOfSelected - 1;
    const prevId = searchStore.results[prevIndex].id;
    const newId = isLeft ? prevId : nextId;

    if (!searchStore.results.find((f) => f.id === newId))
      searchStore.loadFiltered({
        page: searchStore.page + 1 * (isLeft ? -1 : 1),
      });

    searchStore.toggleSelected([
      { id: selectedId, isSelected: false },
      { id: newId, isSelected: true },
    ]);
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
