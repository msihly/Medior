import { ipcRenderer } from "electron";
import { createContext, createRef, useCallback, useEffect, useMemo } from "react";
import Mongoose from "mongoose";
import {
  FileImportBatchModel,
  FileModel,
  getAllFiles,
  getAllImportBatches,
  getAllTags,
  TagModel,
} from "database";
import { observer } from "mobx-react-lite";
import { File, useStores } from "store";
import { Drawer, FileContainer, TopBar, View } from "components";
import { $C, dayjs, makeClasses } from "utils";

const NUMERICAL_ATTRIBUTES = ["duration", "height", "rating", "size", "width"];

export const DisplayedFilesContext = createContext<File[]>(null);
export const FilteredFilesContext = createContext<File[]>(null);

export const Home = observer(() => {
  const drawerRef = createRef();

  const { fileStore, homeStore, importStore, tagStore } = useStores();

  const { css } = useClasses({
    drawerMode: homeStore.drawerMode,
    drawerWidth: 200,
    isDrawerOpen: homeStore.isDrawerOpen,
  });

  useEffect(() => {
    document.title = "Home";
    console.debug("Home window useEffect fired.");

    const loadDatabase = async () => {
      try {
        const databaseUri = await ipcRenderer.invoke("getDatabaseUri");
        console.debug("Connecting to database:", databaseUri, "...");
        await Mongoose.connect(databaseUri);

        console.debug("Connected to database. Retrieving data...");
        const [files, importBatches, tags] = await Promise.all([
          getAllFiles(),
          getAllImportBatches(),
          getAllTags(),
        ]);

        console.debug("Data retrieved. Storing in MobX...");

        tagStore.overwrite(tags);
        fileStore.overwrite(files);
        importStore.overwrite(importBatches);

        console.debug("Data stored in MobX.");

        FileModel.watch().on("change", (data: any) => {
          const id = Buffer.from(data.documentKey?._id).toString();
          console.debug(`[File] ${id}:`, data);

          switch (data.operationType) {
            case "insert":
              fileStore.addFiles({ ...data.fullDocument, id, _id: undefined, __v: undefined });
              break;
            case "update":
              fileStore.getById(id).update(data.updateDescription?.updatedFields);
              break;
          }
        });

        FileImportBatchModel.watch().on("change", (data: any) => {
          const id = Buffer.from(data.documentKey?._id).toString();
          console.debug(`[FileImportBatch] ${id}:`, data);

          if (data.operationType === "update") {
            const updates = data.updateDescription?.updatedFields;
            if (Object.keys(updates).includes("tagIds"))
              importStore.getById(id).setTagIds(updates?.tagIds);
          }
        });

        TagModel.watch().on("change", (data: any) => {
          const id = Buffer.from(data.documentKey?._id).toString();
          console.debug(`[Tag] ${id}:`, data);

          switch (data.operationType) {
            case "delete":
              if (tagStore.activeTagId === id) tagStore.setActiveTagId(null);
              if (tagStore.isTaggerOpen) tagStore.setTaggerMode("edit");
              if (tagStore.isTagManagerOpen) tagStore.setTagManagerMode("search");
              tagStore.deleteTag(id);
              break;
            case "insert":
              tagStore.createTag({ ...data.fullDocument, id, _id: undefined, __v: undefined });
              break;
            case "update":
              tagStore.getById(id).update(data.updateDescription?.updatedFields);
              break;
          }
        });
      } catch (err) {
        console.error(err);
      }
    };

    loadDatabase();
  }, []);

  const compareFn = useCallback(
    (a, b) => {
      const first = a[homeStore.sortKey];
      const second = b[homeStore.sortKey];
      if (NUMERICAL_ATTRIBUTES.includes(homeStore.sortKey)) return second - first;
      if (["dateCreated", "dateModified"].includes(homeStore.sortKey))
        return dayjs(second).isBefore(first) ? -1 : 1;
      return String(second).localeCompare(String(first));
    },
    [homeStore.sortKey]
  );

  const sortFn = useCallback(
    (a, b) => {
      const comparison = compareFn(a, b);
      return homeStore.isSortDesc ? comparison : comparison * -1;
    },
    [compareFn, homeStore.isSortDesc]
  );

  const filteredFiles = useMemo(() => {
    const excludedTagIds = homeStore.excludedTags.map((t) => t.id);
    const includedTagIds = homeStore.includedTags.map((t) => t.id);

    return fileStore.files
      .filter((f) => {
        if (homeStore.isArchiveOpen !== f.isArchived) return false;

        const hasTags = f.tagIds?.length > 0;
        if (homeStore.includeTagged && !hasTags) return false;
        if (homeStore.includeUntagged && hasTags) return false;

        const parentTagIds = homeStore.includeDescendants ? f.tagAncestry : [];

        const hasExcluded = excludedTagIds.some((tagId) => f.tagIds.includes(tagId));
        const hasExcludedParent = parentTagIds.some((tagId) => excludedTagIds.includes(tagId));

        const hasIncluded = includedTagIds.every((tagId) => f.tagIds.includes(tagId));
        const hasIncludedParent = parentTagIds.some((tagId) => includedTagIds.includes(tagId));

        const hasExt = !!Object.entries({
          ...homeStore.selectedImageTypes,
          ...homeStore.selectedVideoTypes,
        }).find(([key, value]) => key === f.ext.substring(1) && value);

        return (hasIncluded || hasIncludedParent) && !hasExcluded && !hasExcludedParent && hasExt;
      })
      .sort(sortFn);
  }, [
    sortFn,
    fileStore.files.slice(),
    homeStore.excludedTags,
    homeStore.includeDescendants,
    homeStore.includeTagged,
    homeStore.includeUntagged,
    homeStore.includedTags,
    homeStore.isArchiveOpen,
    homeStore.selectedImageTypes,
    homeStore.selectedVideoTypes,
  ]);

  const displayedFiles = useMemo(() => {
    return filteredFiles.slice(
      (homeStore.page - 1) * $C.FILE_COUNT,
      homeStore.page * $C.FILE_COUNT
    );
  }, [filteredFiles, homeStore.page]);

  return (
    <>
      <Drawer ref={drawerRef} />

      <View className={css.main}>
        <DisplayedFilesContext.Provider value={displayedFiles}>
          <TopBar />

          <FilteredFilesContext.Provider value={filteredFiles}>
            <FileContainer mode="grid" />
          </FilteredFilesContext.Provider>
        </DisplayedFilesContext.Provider>
      </View>
    </>
  );
});

const useClasses = makeClasses((_, { drawerMode, drawerWidth, isDrawerOpen }) => ({
  main: {
    display: "flex",
    flexFlow: "column",
    marginLeft: drawerMode === "persistent" && isDrawerOpen ? drawerWidth : 0,
    width:
      drawerMode === "persistent" && isDrawerOpen ? `calc(100% - ${drawerWidth}px)` : "inherit",
    height: "inherit",
    transition: "all 225ms ease-in-out",
  },
}));
