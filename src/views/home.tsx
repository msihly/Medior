import { ipcRenderer } from "electron";
import {
  createContext,
  createRef,
  Dispatch,
  SetStateAction,
  useEffect,
  useMemo,
  useState,
} from "react";
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
import { useStores } from "store";
import { Drawer, FileContainer, TagOption, TopBar, View } from "components";
import { makeClasses, sortArray } from "utils";
import { File, ImageType, IMAGE_TYPES, VideoType, VIDEO_TYPES } from "store/files";
import { getTagAncestry } from "store/tags";

const NUMERICAL_ATTRIBUTES = ["rating", "size"];
const ROW_COUNT = 40;

type SelectedImageTypes = { [ext in ImageType]: boolean };
type SelectedVideoTypes = { [ext in VideoType]: boolean };

interface HomeContextProps {
  displayedFiles: File[];
  excludedTags: TagOption[];
  filteredFiles: File[];
  includeDescendants: boolean;
  includeTagged: boolean;
  includeUntagged: boolean;
  includedTags: TagOption[];
  isArchiveOpen: boolean;
  isSortDesc: boolean;
  page: number;
  pageCount: number;
  selectedImageTypes: SelectedImageTypes;
  selectedVideoTypes: SelectedVideoTypes;
  sortKey: string;
  setExcludedTags: Dispatch<SetStateAction<TagOption[]>>;
  setIncludeDescendants: Dispatch<SetStateAction<boolean>>;
  setIncludeTagged: Dispatch<SetStateAction<boolean>>;
  setIncludeUntagged: Dispatch<SetStateAction<boolean>>;
  setIncludedTags: Dispatch<SetStateAction<TagOption[]>>;
  setIsArchiveOpen: Dispatch<SetStateAction<boolean>>;
  setIsSortDesc: Dispatch<SetStateAction<boolean>>;
  setPage: Dispatch<SetStateAction<number>>;
  setSelectedImageTypes: Dispatch<SetStateAction<SelectedImageTypes>>;
  setSelectedVideoTypes: Dispatch<SetStateAction<SelectedVideoTypes>>;
  setSortKey: Dispatch<SetStateAction<string>>;
}

export const HomeContext = createContext<HomeContextProps>(null);

export const Home = observer(() => {
  const drawerRef = createRef();

  const { appStore, fileStore, importStore, tagStore } = useStores();

  const { classes: css } = useClasses({
    drawerMode: appStore.drawerMode,
    drawerWidth: 200,
    isDrawerOpen: appStore.isDrawerOpen,
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

        console.debug("Data retrieved. Storing in MST...");
        tagStore.overwrite(tags);
        fileStore.overwrite(files);
        importStore.overwrite(importBatches);

        console.debug("Data stored in MST.");

        FileModel.watch().on("change", (data: any) => {
          const id = Buffer.from(data.documentKey?._id).toString();
          console.debug(`[File] ${id}:`, data);

          switch (data.operationType) {
            case "insert":
              fileStore.addFiles({ ...data.fullDocument, id });
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
              tagStore.deleteTag(id);
              break;
            case "insert":
              tagStore.createTag({ ...data.fullDocument, id });
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

  const [excludedTags, setExcludedTags] = useState<TagOption[]>([]);
  const [includeDescendants, setIncludeDescendants] = useState(false);
  const [includeTagged, setIncludeTagged] = useState(false);
  const [includeUntagged, setIncludeUntagged] = useState(false);
  const [includedTags, setIncludedTags] = useState<TagOption[]>([]);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [isSortDesc, setIsSortDesc] = useState(true);
  const [page, setPage] = useState(1);
  const [selectedImageTypes, setSelectedImageTypes] = useState(
    Object.fromEntries(IMAGE_TYPES.map((ext) => [ext, true])) as SelectedImageTypes
  );
  const [selectedVideoTypes, setSelectedVideoTypes] = useState(
    Object.fromEntries(VIDEO_TYPES.map((ext) => [ext, true])) as SelectedVideoTypes
  );
  const [sortKey, setSortKey] = useState("dateModified");

  const filtered = useMemo(() => {
    const excludedTagIds = excludedTags.map((t) => t.id);
    const includedTagIds = includedTags.map((t) => t.id);

    return fileStore.files.filter((f) => {
      if (isArchiveOpen !== f.isArchived) return false;

      const hasTags = f.tagIds?.length > 0;
      if (includeTagged && !hasTags) return false;
      if (includeUntagged && hasTags) return false;

      const parentTagIds = includeDescendants ? [...new Set(getTagAncestry(f.tags))] : [];

      const hasExcluded = excludedTagIds.some((tagId) => f.tagIds.includes(tagId));
      const hasExcludedParent = parentTagIds.some((tagId) => excludedTagIds.includes(tagId));

      const hasIncluded = includedTagIds.every((tagId) => f.tagIds.includes(tagId));
      const hasIncludedParent = parentTagIds.some((tagId) => includedTagIds.includes(tagId));

      const hasExt = !!Object.entries({ ...selectedImageTypes, ...selectedVideoTypes }).find(
        ([key, value]) => key === f.ext.substring(1) && value
      );

      return (hasIncluded || hasIncludedParent) && !hasExcluded && !hasExcludedParent && hasExt;
    });
  }, [
    excludedTags,
    fileStore.files.slice(),
    includeDescendants,
    includeTagged,
    includeUntagged,
    includedTags,
    isArchiveOpen,
    selectedImageTypes,
    selectedVideoTypes,
  ]);

  const [displayedFiles, filteredFiles, pageCount] = useMemo(() => {
    const sorted = sortArray(filtered, sortKey, isSortDesc, NUMERICAL_ATTRIBUTES.includes(sortKey));
    const displayed = sorted.slice((page - 1) * ROW_COUNT, page * ROW_COUNT);
    const pageCount = sorted.length < ROW_COUNT ? 1 : Math.ceil(sorted.length / ROW_COUNT);
    return [displayed, sorted, pageCount];
  }, [filtered.slice(), isSortDesc, sortKey]);

  return (
    <HomeContext.Provider
      value={{
        displayedFiles,
        excludedTags,
        filteredFiles,
        includeDescendants,
        includeTagged,
        includeUntagged,
        includedTags,
        isArchiveOpen,
        isSortDesc,
        page,
        pageCount,
        selectedImageTypes,
        selectedVideoTypes,
        sortKey,
        setExcludedTags,
        setIncludeDescendants,
        setIncludeTagged,
        setIncludeUntagged,
        setIncludedTags,
        setIsArchiveOpen,
        setIsSortDesc,
        setPage,
        setSelectedImageTypes,
        setSelectedVideoTypes,
        setSortKey,
      }}
    >
      <Drawer ref={drawerRef} />

      <View className={css.main}>
        <TopBar />
        <FileContainer mode="grid" />
      </View>
    </HomeContext.Provider>
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
