import { useEffect, useRef, useState, WheelEvent } from "react";
import { applySnapshot, getSnapshot } from "mobx-keystone";
import {
  Button,
  Comp,
  FileCollectionEditor,
  Modal,
  RatingButton,
  Text,
  View,
} from "medior/components";
import { File, useStores } from "medior/store";
import { colors, toast } from "medior/utils/client";
import { trpc } from "medior/utils/server";
import { CarouselWindow } from "medior/views";

const TRIAGE_QUEUE_PAGE_SIZE = 100_000;

export const CollectionTriager = Comp(() => {
  const stores = useStores();
  const manager = stores.collection.manager;
  const editor = stores.collection.editor;

  const carouselSnapshot = useRef(getSnapshot(stores.carousel));
  const fileSearchSnapshot = useRef(getSnapshot(stores.file.search));

  const [isLoading, setIsLoading] = useState(true);
  const [queue, setQueue] = useState<string[]>([]);

  const collection = editor.collection;

  useEffect(() => {
    void loadQueue();

    return () => {
      applySnapshot(stores.carousel, carouselSnapshot.current);
      applySnapshot(stores.file.search, fileSearchSnapshot.current);
    };
  }, []);

  useEffect(() => {
    if (queue[0]) void loadCollection(queue[0]);
    else {
      editor.setIsOpen(false);
      stores.carousel.setActiveFileId("");
      stores.carousel.setSelectedFileIds([]);
      setIsLoading(false);
    }
  }, [queue[0]]);

  const loadQueue = async () => {
    try {
      setIsLoading(true);
      const res = await trpc.listFilteredFileCollection.mutate({
        ...manager.search.getCachedFilterProps(),
        page: 1,
        pageSize: TRIAGE_QUEUE_PAGE_SIZE,
        select: { _id: 1 },
      });
      if (!res.success) throw new Error(res.error);

      setQueue(res.data.map((item) => item.id));
      if (!res.data.length) toast.info("No collections found for this search");
    } catch (err) {
      toast.error(err);
      setIsLoading(false);
    }
  };

  const loadCollection = async (id: string) => {
    try {
      setIsLoading(true);
      await editor.loadCollection(id);

      const fileIds = editor.getFileIdsForCarousel();
      const filesRes = await trpc.listFile.mutate({ args: { filter: { id: fileIds } } });
      if (!filesRes.success) throw new Error(filesRes.error);

      stores.file.search.setIds(fileIds);
      stores.file.search.setResults(filesRes.data.items.map((file) => new File(file)));
      stores.carousel.setSelectedFileIds(fileIds);
      stores.carousel.setActiveFileId(fileIds[0] ?? "");
    } catch (err) {
      toast.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const advance = () => {
    setQueue((prev) => prev.slice(1));
    void manager.search.loadFiltered();
  };

  const close = () => manager.setIsTriagerOpen(false);

  const handleCarouselWheel = (event: WheelEvent) => {
    if (event.ctrlKey) return;

    event.preventDefault();
    event.stopPropagation();

    const nextIndex = stores.carousel.activeFileIndex + (event.deltaY < 0 ? -1 : 1);
    const nextFileId = stores.carousel.selectedFileIds[nextIndex];
    if (!nextFileId) return;

    stores.carousel.setActiveFileId(nextFileId);
    stores.file.setActiveFileId(nextFileId);
  };

  const handleDelete = async (withFiles: boolean) => {
    if (!collection) return;

    try {
      setIsLoading(true);
      if (withFiles) {
        const archiveRes = await stores.file.archiveFiles(editor.getFileIdsForCarousel());
        if (!archiveRes.success) throw new Error(archiveRes.error);
      }

      const deleteRes = await stores.collection.deleteCollections([collection.id]);
      if (!deleteRes.success) throw new Error(deleteRes.error);

      toast.success("Collection deleted");
      advance();
    } catch (err) {
      toast.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRating = async (rating: number) => {
    if (!collection) return;

    try {
      setIsLoading(true);
      await stores.collection.updateCollRating({ id: collection.id, rating });
      advance();
    } catch (err) {
      toast.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal.Container
      isLoading={isLoading || editor.isLoading}
      onClose={close}
      height="100%"
      width="100%"
    >
      <Modal.Header rightNode={<Text preset="sub-text">{`${queue.length} remaining`}</Text>}>
        <Text preset="title">{"Collection Triager"}</Text>
      </Modal.Header>

      <Modal.Content row dividers={false} flex={1} height="100%" spacing="0.5rem">
        <View flex={1} overflow="hidden" onWheelCapture={handleCarouselWheel}>
          <CarouselWindow embedded />
        </View>

        <FileCollectionEditor embedded maxCards={3} onClose={close} />
      </Modal.Content>

      <Modal.Footer>
        <Button text="Close" icon="Close" onClick={close} />

        <Button
          text="Delete"
          icon="Delete"
          onClick={() => handleDelete(false)}
          disabled={!collection || isLoading}
          color={colors.custom.red}
        />

        <Button
          text="Delete w/ Files"
          icon="Archive"
          onClick={() => handleDelete(true)}
          disabled={!collection || isLoading}
          color={colors.custom.orange}
        />

        <RatingButton button rating={collection?.rating ?? 0} setRating={handleRating} />
      </Modal.Footer>
    </Modal.Container>
  );
});
