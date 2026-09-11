import { MouseEvent, useEffect, useRef, useState } from "react";
import {
  Button,
  Card,
  Checkbox,
  Chip,
  Comp,
  FileCollection,
  FileCollectionEditor,
  Modal,
  NumInput,
  Pagination,
  SearchLoadingOverlay,
  Text,
  View,
} from "medior/components";
import { File, FileCollection as FileCollectionModel, useStores } from "medior/store";
import { colors, toast } from "medior/utils/client";
import { trpc } from "medior/utils/server";

interface RelatedCollection {
  id: string;
  searchIndex: number;
  similarityPercentage: number;
  similarityPercentageById: Record<string, number>;
}

interface RelatedGroup {
  collections: RelatedCollection[];
}

const getHighestSimilarity = (group: RelatedGroup) =>
  Math.max(...group.collections.slice(1).map(({ similarityPercentage }) => similarityPercentage));

const getSelectableIds = (group?: RelatedGroup, selectedBaseId?: string) => {
  if (!group) return [];
  const baseId =
    selectedBaseId ??
    [...group.collections].sort((left, right) => left.searchIndex - right.searchIndex)[0].id;
  return group.collections.filter(({ id }) => id !== baseId).map(({ id }) => id);
};

export interface RelatedCollectionsQueueProps {
  onClose: () => void;
}

export const RelatedCollectionsQueue = Comp(({ onClose }: RelatedCollectionsQueueProps) => {
  const stores = useStores();
  const manager = stores.collection.manager;

  const managerFiles = useRef(new Map(manager.search.files));
  const managerSelectedIds = useRef([...manager.search.selectedIds]);
  const collectionLoadId = useRef(0);
  const mergeIds = useRef<string[]>([]);
  const mergeLoadId = useRef(0);
  const quickMergeLoadId = useRef(0);
  const queueLoadId = useRef(0);

  const [groups, setGroups] = useState<RelatedGroup[]>([]);
  const [baseId, setBaseId] = useState("");
  const [groupIndex, setGroupIndex] = useState(0);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [includeFileOverlap, setIncludeFileOverlap] = useState(true);
  const [includeOriginalFolder, setIncludeOriginalFolder] = useState(false);
  const [includeTitle, setIncludeTitle] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadedCollections, setLoadedCollections] = useState<FileCollectionModel[]>([]);
  const [lookupError, setLookupError] = useState("");
  const [isMergeEditorOpen, setIsMergeEditorOpen] = useState(false);
  const [isMergeSaving, setIsMergeSaving] = useState(false);
  const [isQuickMergeSaving, setIsQuickMergeSaving] = useState(false);
  const [minCommonPercentage, setMinCommonPercentage] = useState(50);
  const [resultPage, setResultPage] = useState(1);

  const group = groups[groupIndex];
  const defaultBaseEntry = group
    ? [...group.collections].sort((left, right) => left.searchIndex - right.searchIndex)[0]
    : null;
  const baseEntry = group?.collections.find(({ id }) => id === baseId) ?? defaultBaseEntry;
  const foundEntries =
    group?.collections
      .filter(({ id }) => id !== baseEntry.id)
      .sort(
        (left, right) =>
          right.similarityPercentageById[baseEntry.id] -
            left.similarityPercentageById[baseEntry.id] || left.searchIndex - right.searchIndex,
      ) ?? [];
  const pageSize = Math.max(1, manager.search.pageSize);
  const pageCount = Math.ceil(foundEntries.length / pageSize);
  const pagedEntries = foundEntries.slice((resultPage - 1) * pageSize, resultPage * pageSize);
  const visibleIds = [baseEntry?.id, ...pagedEntries.map(({ id }) => id)].filter(Boolean);
  const loadedCollectionById = new Map(
    loadedCollections.map((collection) => [collection.id, collection]),
  );
  const selectedIds = baseEntry
    ? [
        baseEntry.id,
        ...foundEntries.map(({ id }) => id).filter((id) => manager.search.selectedIds.includes(id)),
      ]
    : [];

  useEffect(() => {
    void loadQueue();
  }, []);

  useEffect(() => {
    setBaseId(defaultBaseEntry?.id ?? "");
    manager.search.setSelectedIds(getSelectableIds(group, defaultBaseEntry?.id));
    setResultPage(1);
  }, [groupIndex, groups]);

  useEffect(() => {
    setLoadedCollections([]);
    if (visibleIds.length) void loadCollections(visibleIds);
    else collectionLoadId.current += 1;
  }, [visibleIds.join(":")]);

  useEffect(() => {
    return () => {
      collectionLoadId.current += 1;
      manager.search.setFiles(managerFiles.current);
      manager.search.setSelectedIds(managerSelectedIds.current);
    };
  }, []);

  const loadCollections = async (ids: string[]) => {
    const loadId = ++collectionLoadId.current;
    try {
      setIsLoading(true);
      const collectionRes = await trpc.listFileCollection.mutate({
        args: { filter: { id: ids } },
      });
      if (!collectionRes.success) throw new Error(collectionRes.error);
      if (loadId !== collectionLoadId.current) return;
      const collectionById = new Map(
        collectionRes.data.items.map((collection) => [collection.id, collection]),
      );
      const nextCollections = ids.map((id) => new FileCollectionModel(collectionById.get(id)));
      const tagsRes = await trpc.listTag.mutate({
        filter: { id: [...new Set(nextCollections.flatMap(({ tagIds }) => tagIds))] },
      });
      if (!tagsRes.success) throw new Error(tagsRes.error);
      if (loadId !== collectionLoadId.current) return;
      nextCollections.forEach((collection) =>
        collection.setTags(tagsRes.data.filter(({ id }) => collection.tagIds.includes(id))),
      );

      const filesRes = await trpc.listFile.mutate({
        args: {
          filter: { id: [...new Set(nextCollections.flatMap(({ previewIds }) => previewIds))] },
        },
      });
      if (!filesRes.success) throw new Error(filesRes.error);
      if (loadId !== collectionLoadId.current) return;

      manager.search.setFiles(
        new Map([
          ...managerFiles.current,
          ...filesRes.data.items.map((file) => [file.id, new File(file)] as const),
        ]),
      );
      setLoadedCollections(nextCollections);
    } catch (error) {
      if (loadId === collectionLoadId.current) toast.error(error);
    } finally {
      if (loadId === collectionLoadId.current) setIsLoading(false);
    }
  };

  const loadQueue = async () => {
    const loadId = ++queueLoadId.current;
    try {
      setIsLoading(true);
      setLookupError("");
      const res = await trpc.findRelatedCollectionGroups.mutate({
        includeFileOverlap,
        includeOriginalFolder,
        includeTitle,
        minCommonPercentage,
        sortValue: manager.search.sortValue,
      });
      if (!res.success) throw new Error(res.error);
      if (loadId !== queueLoadId.current) return;
      setGroupIndex(0);
      setGroups(
        [...res.data].sort(
          (left, right) =>
            getHighestSimilarity(right) - getHighestSimilarity(left) ||
            right.collections.length - left.collections.length ||
            left.collections[0].searchIndex - right.collections[0].searchIndex,
        ),
      );
      setHasUnsavedChanges(false);
      if (!res.data.length) toast.info("No related collections found");
    } catch (error) {
      if (loadId !== queueLoadId.current) return;
      setGroupIndex(0);
      setGroups([]);
      setLookupError(error instanceof Error ? error.message : String(error));
      toast.error(error);
    } finally {
      if (loadId === queueLoadId.current) setIsLoading(false);
    }
  };

  const cancelLoad = () => {
    collectionLoadId.current += 1;
    quickMergeLoadId.current += 1;
    queueLoadId.current += 1;
    manager.search.cancelLoad();
    setIsLoading(false);
  };

  const handleNext = () => {
    if (groupIndex < groups.length - 1) setGroupIndex((index) => index + 1);
  };

  const handlePrevious = () => {
    if (groupIndex > 0) setGroupIndex((index) => index - 1);
  };

  const handleFileOverlapChange = (checked: boolean) => {
    setHasUnsavedChanges(true);
    setIncludeFileOverlap(checked);
  };

  const handleOriginalFolderChange = (checked: boolean) => {
    setHasUnsavedChanges(true);
    setIncludeOriginalFolder(checked);
  };

  const handleOverlapChange = (value: number) => {
    setHasUnsavedChanges(true);
    setMinCommonPercentage(value);
  };

  const handleTitleChange = (checked: boolean) => {
    setHasUnsavedChanges(true);
    setIncludeTitle(checked);
  };

  const handleSetBase = (event: MouseEvent, id: string) => {
    event.stopPropagation();
    setBaseId(id);
    manager.search.setSelectedIds(getSelectableIds(group, id));
  };

  const getOrderedSelectedIds = () =>
    [
      baseEntry,
      ...group.collections
        .filter(({ id }) => id !== baseEntry.id)
        .sort((left, right) => left.searchIndex - right.searchIndex),
    ]
      .map(({ id }) => id)
      .filter((id) => selectedIds.includes(id));

  const advanceAfterMerge = () => {
    const nextGroups = groups.filter((_, index) => index !== groupIndex);
    const nextGroupIndex = Math.min(groupIndex, Math.max(0, nextGroups.length - 1));
    setGroups(nextGroups);
    setGroupIndex(nextGroupIndex);
    setBaseId("");
    manager.search.setSelectedIds(getSelectableIds(nextGroups[nextGroupIndex]));
  };

  const openMergeConfirmation = async () => {
    const editor = stores.collection.editor;
    const loadId = ++mergeLoadId.current;
    try {
      if (selectedIds.length < 2) throw new Error("Select at least two collections to merge");
      editor.setIsLoading(true);
      editor.search.setIsLoading(true);
      setIsMergeEditorOpen(true);
      const orderedIds = getOrderedSelectedIds();
      mergeIds.current = orderedIds;
      const res = await trpc.previewCollectionMerge.mutate({ ids: orderedIds });
      if (!res.success) throw new Error(res.error);
      if (loadId !== mergeLoadId.current) return;
      await stores.collection.editor.loadMergePreview(res.data.collection);
    } catch (error) {
      closeMergeEditor();
      toast.error(error);
    } finally {
      editor.setIsLoading(false);
    }
  };

  const handleMerge = async () => {
    const editor = stores.collection.editor;
    try {
      setIsMergeSaving(true);
      editor.setIsLoading(true);
      const res = await trpc.mergeCollections.mutate({
        fileIdIndexes: editor.fileIndexes,
        ids: mergeIds.current,
        title: editor.title,
      });
      if (!res.success) throw new Error(res.error);
      toast.success("Collections merged");
      closeMergeEditor();
      advanceAfterMerge();
    } catch (error) {
      toast.error(error);
    } finally {
      editor.setIsLoading(false);
      setIsMergeSaving(false);
      setIsLoading(false);
    }
  };

  const handleQuickMerge = async () => {
    const loadId = ++quickMergeLoadId.current;
    try {
      if (selectedIds.length < 2) throw new Error("Select at least two collections to merge");
      setIsLoading(true);
      const ids = getOrderedSelectedIds();
      const previewRes = await trpc.previewCollectionMerge.mutate({ ids });
      if (!previewRes.success) throw new Error(previewRes.error);
      if (loadId !== quickMergeLoadId.current) return;

      setIsLoading(false);
      setIsQuickMergeSaving(true);
      const mergeRes = await trpc.mergeCollections.mutate({
        fileIdIndexes: previewRes.data.collection.fileIdIndexes,
        ids,
        title: previewRes.data.collection.title,
      });
      if (!mergeRes.success) throw new Error(mergeRes.error);

      toast.success("Collections merged");
      advanceAfterMerge();
    } catch (error) {
      if (loadId === quickMergeLoadId.current) toast.error(error);
    } finally {
      if (loadId === quickMergeLoadId.current) {
        setIsLoading(false);
        setIsQuickMergeSaving(false);
      }
    }
  };

  const closeMergeEditor = () => {
    mergeLoadId.current += 1;
    mergeIds.current = [];
    stores.collection.editor.setIsOpen(false);
    stores.collection.editor.setIsLoading(false);
    setIsMergeEditorOpen(false);
  };

  const resultsContent = !group ? (
    <View column flex={1} align="center" justify="center" spacing="0.5rem">
      <Text preset="title">{lookupError ? "Lookup Failed" : "No Related Collections"}</Text>

      {lookupError && (
        <Text color={colors.custom.red} textAlign="center" whiteSpace="normal">
          {lookupError}
        </Text>
      )}
    </View>
  ) : (
    <View column flex={1} overflow="hidden" spacing="0.5rem">
      <View column flex="none" spacing="0.3rem">
        {loadedCollectionById.get(baseEntry.id) && (
          <FileCollection collection={loadedCollectionById.get(baseEntry.id)} disableSelection />
        )}
      </View>

      <View column flex={1} position="relative" overflow="hidden" spacing="0.3rem">
        <Text preset="title" padding="0 0.5rem">
          {`Matches - ${foundEntries.length}`}
        </Text>

        <View column flex={1} spacing="0.5rem" overflow="hidden auto">
          {pagedEntries.map((entry) => {
            const foundCollection = loadedCollectionById.get(entry.id);
            return foundCollection ? (
              <FileCollection
                key={entry.id}
                collection={foundCollection}
                rightNode={
                  <View row align="center" spacing="0.5rem">
                    <Chip
                      label={`${entry.similarityPercentageById[baseEntry.id]}% similar`}
                      height="1.5em"
                    />

                    <Button
                      text="Set as Base"
                      onClick={(event) => handleSetBase(event, entry.id)}
                    />
                  </View>
                }
              />
            ) : null;
          })}
        </View>

        <View flex="none" height="3rem" position="relative">
          <Pagination
            count={pageCount}
            page={resultPage}
            onChange={setResultPage}
            siblingCount={2}
          />
        </View>
      </View>
    </View>
  );

  return (
    <Modal.Container isLoading={isQuickMergeSaving} onClose={onClose} height="100%" width="100%">
      <Modal.Header>
        <Text preset="title">{"Related Collections"}</Text>
      </Modal.Header>

      <Modal.Content
        dividers={false}
        flex={1}
        height="100%"
        padding={{ all: "0.5rem" }}
        position="relative"
      >
        <SearchLoadingOverlay
          isLoading={isLoading && !isMergeEditorOpen}
          onCancel={cancelLoad}
          store={manager.search}
        />

        <View row flex="none" align="center" padding={{ all: "0.3rem" }}>
          <Card row align="center" spacing="0.5rem">
            <Checkbox
              label="File Overlap"
              checked={includeFileOverlap}
              setChecked={handleFileOverlapChange}
              flex={0}
              width="auto"
            />

            <NumInput
              placeholder="Overlap"
              adornment="%"
              disabled={!includeFileOverlap}
              maxValue={100}
              minValue={0}
              value={minCommonPercentage}
              setValue={handleOverlapChange}
              width="5.5rem"
              dense
              textAlign="center"
            />

            <Checkbox
              label="Original Folder"
              checked={includeOriginalFolder}
              setChecked={handleOriginalFolderChange}
              flex={0}
              width="auto"
            />

            <Checkbox
              label="Title"
              checked={includeTitle}
              setChecked={handleTitleChange}
              flex={0}
              width="auto"
            />

            <Button
              text="Search"
              icon="Search"
              onClick={loadQueue}
              color={hasUnsavedChanges ? colors.custom.blue : undefined}
            />
          </Card>
        </View>

        {resultsContent}
      </Modal.Content>

      <Modal.Footer>
        <Button text="Close" icon="Close" onClick={onClose} />

        <Button
          text="Previous"
          icon="NavigateBefore"
          onClick={handlePrevious}
          disabled={!group || groupIndex === 0}
        />

        <Button
          text="Next"
          icon="NavigateNext"
          onClick={handleNext}
          disabled={!group || groupIndex === groups.length - 1}
        />

        <Button
          text="Quick Merge"
          icon="Merge"
          onClick={handleQuickMerge}
          disabled={selectedIds.length < 2}
          color={colors.custom.purple}
        />

        <Button
          text="Merge"
          icon="Merge"
          onClick={openMergeConfirmation}
          disabled={selectedIds.length < 2}
          color={colors.custom.blue}
        />
      </Modal.Footer>

      {isMergeEditorOpen && (
        <FileCollectionEditor
          mode="merge"
          isSaving={isMergeSaving}
          onCancelLoad={closeMergeEditor}
          onClose={closeMergeEditor}
          onSave={handleMerge}
        />
      )}
    </Modal.Container>
  );
});
