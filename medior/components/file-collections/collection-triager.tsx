import { useEffect, useRef, useState, WheelEvent } from "react";
import { applySnapshot, getSnapshot } from "mobx-keystone";
import {
  Button,
  Comp,
  FileCollectionEditor,
  LoadingOverlay,
  Modal,
  RatingButton,
  Text,
  View,
} from "medior/components";
import { useStores } from "medior/store";
import { colors, toast } from "medior/utils/client";
import { trpc } from "medior/utils/server";
import { CarouselWindow } from "medior/views";

const TRIAGE_QUEUE_PAGE_SIZE = 1000;

export const CollectionTriager = Comp(() => {
  const stores = useStores();

  const carouselSnapshot = useRef(getSnapshot(stores.carousel));
  const disposed = useRef(false);
  const fileSearchSnapshot = useRef(getSnapshot(stores.file.search));
  const loadRevision = useRef(0);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [queue, setQueue] = useState<string[]>([]);

  const collection = stores.collection.editor.collection;

  useEffect(() => {
    disposed.current = false;
    loadQueue();

    return () => {
      disposed.current = true;
      loadRevision.current++;
      stores.collection.editor.setIsOpen(false);
      applySnapshot(stores.carousel, carouselSnapshot.current);
      applySnapshot(stores.file.search, {
        ...fileSearchSnapshot.current,
        isLoading: false,
        loadId: stores.file.search.loadId + 1,
      });
    };
  }, []);

  useEffect(() => {
    if (queue[0]) loadCollection(queue[0]);
    else {
      stores.collection.editor.setIsOpen(false);
      stores.carousel.setActiveFileId("");
      stores.carousel.setSelectedFileIds([]);
      stores.carousel.setVisibleFileIds([]);
    }
  }, [queue[0]]);

  const loadQueue = async () => {
    try {
      setIsLoading(true);

      const filters = stores.collection.manager.search.getCachedFilterProps();
      const ids: string[] = [];
      let page = 1;

      while (!disposed.current) {
        const res = await trpc.listFilteredFileCollection.mutate({
          ...filters,
          page,
          pageSize: TRIAGE_QUEUE_PAGE_SIZE,
          select: { _id: 1 },
        });

        if (!res.success) throw new Error(res.error);

        for (const item of res.data) ids.push(item.id);

        if (res.data.length < TRIAGE_QUEUE_PAGE_SIZE) break;

        page++;
      }

      if (disposed.current) return;

      setQueue([...new Set(ids)]);

      if (!ids.length) {
        setIsLoading(false);
        toast.info("No collections found for this search");
      }
    } catch (err) {
      if (disposed.current) return;

      toast.error(err);
      setIsLoading(false);
    }
  };

  const loadCollection = async (id: string) => {
    const revision = ++loadRevision.current;

    try {
      setIsLoading(true);
      stores.carousel.setActiveFileId("");
      stores.carousel.setIsPlaying(false);
      stores.carousel.setSelectedFileIds([]);
      stores.carousel.setVisibleFileIds([]);
      stores.file.setActiveFileId("");
      stores.file.search.setLoadId(stores.file.search.loadId + 1);
      stores.file.search.setIds([]);
      stores.file.search.setResults([]);

      const loaded = await stores.collection.editor.loadCollection(id);

      if (!loaded.success) throw new Error(loaded.error);

      if (!loaded.data || disposed.current || revision !== loadRevision.current) return;

      const fileIds = stores.collection.editor.getFileIdsForCarousel();

      stores.carousel.setSelectedFileIds(fileIds);
      stores.carousel.setActiveFileId(fileIds[0] ?? "");
      stores.file.setActiveFileId(fileIds[0] ?? "");
    } catch (err) {
      if (!disposed.current && revision === loadRevision.current) toast.error(err);
    } finally {
      if (!disposed.current && revision === loadRevision.current) setIsLoading(false);
    }
  };

  const advance = () => {
    setQueue((prev) => prev.slice(1));
    stores.collection.manager.search.loadFiltered();
  };

  const close = () => {
    if (!isSaving && !stores.collection.editor.isSaving) {
      disposed.current = true;
      loadRevision.current++;
      stores.collection.editor.cancelLoad();
      stores.collection.manager.setIsTriagerOpen(false);
    }
  };

  const handleCarouselWheel = (event: WheelEvent) => {
    if (event.ctrlKey) return;

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
      setIsSaving(true);

      if (withFiles) {
        const archiveRes = await stores.file.archiveFiles(
          stores.collection.editor.getFileIdsForCarousel(),
        );

        if (!archiveRes.success) throw new Error(archiveRes.error);
      }

      const deleteRes = await stores.collection.deleteCollections([collection.id]);

      if (!deleteRes.success) throw new Error(deleteRes.error);

      toast.success("Collection deleted");
      advance();
    } catch (err) {
      toast.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRating = async (rating: number) => {
    if (!collection) return;

    try {
      setIsSaving(true);

      const result = await stores.collection.updateCollRating({ id: collection.id, rating });

      if (!result.success) throw new Error(result.error);

      if (disposed.current) return;

      advance();
    } catch (err) {
      toast.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    if (!stores.collection.editor.title) return toast.error("Title is required!");

    await stores.collection.editor.saveCollection();
  };

  return (
    <Modal.Container
      onClose={close}
      height="100%"
      width="100%"
      isLoading={isSaving || stores.collection.editor.isSaving}
    >
      <LoadingOverlay
        isLoading={isLoading && !isSaving}
        sub={<Button text="Cancel" icon="Close" onClick={close} />}
      />

      <Modal.Header rightNode={<Text preset="sub-text">{`${queue.length} remaining`}</Text>}>
        <Text preset="title">{"Collection Triager"}</Text>
      </Modal.Header>

      <Modal.Content row dividers={false} flex={1} height="100%" spacing="0.5rem">
        <View flex={1} overflow="hidden" onWheelCapture={handleCarouselWheel}>
          <CarouselWindow embedded />
        </View>

        <FileCollectionEditor
          embedded
          maxCards={3}
          onCancelLoad={close}
          onClose={close}
          onRating={handleRating}
        />
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

        <Button
          text="Save"
          icon="Save"
          onClick={handleSave}
          disabled={
            !stores.collection.editor.hasUnsavedChanges || stores.collection.editor.isLoading
          }
          color={colors.custom.purple}
        />
      </Modal.Footer>
    </Modal.Container>
  );
});
