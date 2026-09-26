import { useEffect, useRef, useState } from "react";
import { useStores } from "medior/store";
import { toast } from "medior/utils/client";
import { trpc } from "medior/utils/server";

export const useCollectionMerge = ({
  getSelectedIds,
  onMerged,
}: {
  getSelectedIds: () => string[];
  onMerged: () => void;
}) => {
  const stores = useStores();
  const store = stores.collection.editor;
  const loadId = useRef(0);
  const mergeIds = useRef<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isMergeEditorOpen, setIsMergeEditorOpen] = useState(false);
  const [isMergeSaving, setIsMergeSaving] = useState(false);
  const [isQuickMergeSaving, setIsQuickMergeSaving] = useState(false);

  useEffect(
    () => () => {
      loadId.current += 1;
    },
    [],
  );

  const cancelLoad = () => {
    loadId.current += 1;
    setIsLoading(false);
  };

  const closeMergeEditor = () => {
    cancelLoad();
    mergeIds.current = [];
    store.setIsOpen(false);
    store.setIsLoading(false);
    setIsMergeEditorOpen(false);
  };

  const openMergeConfirmation = async () => {
    const requestId = ++loadId.current;

    try {
      mergeIds.current = [...getSelectedIds()];
      if (mergeIds.current.length < 2) throw new Error("Select at least two collections to merge");

      setIsLoading(true);
      store.setIsLoading(true);
      store.search.setIsLoading(true);
      setIsMergeEditorOpen(true);

      const res = await trpc.previewCollectionMerge.mutate({ ids: mergeIds.current });
      if (requestId !== loadId.current) return;
      if (!res.success) throw new Error(res.error);

      const previewRes = await store.loadMergePreview(res.data.collection);
      if (!previewRes.success) throw new Error(previewRes.error);
    } catch (error) {
      if (requestId === loadId.current) {
        closeMergeEditor();
        toast.error(error);
      }
    } finally {
      if (requestId === loadId.current) {
        store.setIsLoading(false);
        setIsLoading(false);
      }
    }
  };

  const handleMerge = async () => {
    try {
      setIsMergeSaving(true);
      store.setIsLoading(true);

      const res = await trpc.mergeCollections.mutate({
        fileIdIndexes: store.fileIndexes,
        ids: mergeIds.current,
        title: store.title,
      });
      if (!res.success) throw new Error(res.error);

      toast.success("Collections merged");
      closeMergeEditor();
      onMerged();
    } catch (error) {
      toast.error(error);
    } finally {
      store.setIsLoading(false);
      setIsMergeSaving(false);
    }
  };

  const handleQuickMerge = async () => {
    const requestId = ++loadId.current;

    try {
      const ids = [...getSelectedIds()];
      if (ids.length < 2) throw new Error("Select at least two collections to merge");

      setIsLoading(true);

      const previewRes = await trpc.previewCollectionMerge.mutate({ ids });
      if (requestId !== loadId.current) return;
      if (!previewRes.success) throw new Error(previewRes.error);

      setIsLoading(false);
      setIsQuickMergeSaving(true);

      const res = await trpc.mergeCollections.mutate({
        fileIdIndexes: previewRes.data.collection.fileIdIndexes,
        ids,
        title: previewRes.data.collection.title,
      });
      if (!res.success) throw new Error(res.error);

      toast.success("Collections merged");
      onMerged();
    } catch (error) {
      if (requestId === loadId.current) toast.error(error);
    } finally {
      if (requestId === loadId.current) {
        setIsLoading(false);
        setIsQuickMergeSaving(false);
      }
    }
  };

  return {
    cancelLoad,
    closeMergeEditor,
    handleMerge,
    handleQuickMerge,
    isLoading,
    isMergeEditorOpen,
    isMergeSaving,
    isQuickMergeSaving,
    openMergeConfirmation,
  };
};
