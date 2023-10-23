import { useEffect, useRef } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { Pagination, colors } from "@mui/material";
import { View } from "components";
import { DisplayedFiles, InfoModal } from ".";
import { makeClasses } from "utils";
import { toast } from "react-toastify";
import Color from "color";

export const FileContainer = observer(() => {
  const { css } = useClasses(null);

  const rootStore = useStores();
  const { faceRecognitionStore, fileStore, homeStore } = useStores();

  const selectRef = useRef(null);

  useEffect(() => {
    if (fileStore.page > fileStore.pageCount) changePage(fileStore.pageCount);
  }, [fileStore.page, fileStore.pageCount]);

  useEffect(() => {
    homeStore.reloadDisplayedFiles({ rootStore, page: 1 });
  }, [
    homeStore.excludedAnyTags,
    homeStore.includeDescendants,
    homeStore.includeTagged,
    homeStore.includeUntagged,
    homeStore.includedAllTags,
    homeStore.includedAnyTags,
    homeStore.isArchiveOpen,
    homeStore.isSortDesc,
    homeStore.selectedImageTypes,
    homeStore.selectedVideoTypes,
    homeStore.sortKey,
  ]);

  const changePage = async (page: number) =>
    await homeStore.reloadDisplayedFiles({ rootStore, page });

  const handlePageChange = (_, value: number) => changePage(value);

  const handleKeyPress = async (e: React.KeyboardEvent<HTMLElement>) => {
    const fileIds = fileStore.selectedIds;
    const isOneFileSelected = fileIds.length === 1;
    const isMultipleFilesSelected = fileIds.length > 1;

    if (!isOneFileSelected && !isMultipleFilesSelected) return;
    e.preventDefault();

    if (e.key === "t" && !homeStore.isTaggerOpen) {
      homeStore.setTaggerBatchId(null);
      homeStore.setTaggerFileIds([...fileStore.selectedIds]);
      homeStore.setIsTaggerOpen(true);
    } else if (e.key === "Delete") {
      fileStore.deleteFiles({ rootStore, fileIds });
    } else if (e.ctrlKey && e.key === "a") {
      fileStore.toggleFilesSelected(fileStore.files.map(({ id }) => ({ id, isSelected: true })));
      toast.info(`Added ${fileStore.files.length} files to selection`);
    } else if (e.key === "f") {
      if (isOneFileSelected) {
        faceRecognitionStore.setActiveFileId(fileIds[0]);
        faceRecognitionStore.setIsModalOpen(true);
      } else if (isMultipleFilesSelected)
        faceRecognitionStore.addFilesToAutoDetectQueue({ fileIds, rootStore });
    } else if (isOneFileSelected) {
      const selectedId = fileIds[0];

      if (e.key === "i") {
        fileStore.setActiveFileId(selectedId);
        fileStore.setIsInfoModalOpen(true);
      } else if (["ArrowLeft", "ArrowRight"].includes(e.key)) {
        const indexOfSelected = fileStore.files.findIndex((f) => f.id === selectedId);
        const nextIndex = indexOfSelected === fileStore.files.length - 1 ? 0 : indexOfSelected + 1;
        const nextId = fileStore.files[nextIndex].id;
        const prevIndex = indexOfSelected === 0 ? fileStore.files.length - 1 : indexOfSelected - 1;
        const prevId = fileStore.files[prevIndex].id;
        const newId = e.key === "ArrowLeft" ? prevId : nextId;

        if (!fileStore.files.find((f) => f.id === newId))
          changePage(fileStore.page + 1 * (e.key === "ArrowLeft" ? -1 : 1));

        fileStore.toggleFilesSelected([
          { id: selectedId, isSelected: false },
          { id: newId, isSelected: true },
        ]);
      } else if (["1", "2", "3", "4", "5", "6", "7", "8", "9"].includes(e.key)) {
        const res = await fileStore.setFileRating({ fileIds: [selectedId], rating: +e.key });
        if (res.success) toast.success("Rating updated");
        else toast.error("Error updating rating");
      }
    }
  };

  return (
    <View className={css.container}>
      <View ref={selectRef} onKeyDown={handleKeyPress} tabIndex={1} className={css.files}>
        <DisplayedFiles />
      </View>

      <Pagination
        count={fileStore.pageCount}
        page={fileStore.page}
        onChange={handlePageChange}
        showFirstButton
        showLastButton
        className={css.pagination}
      />

      {fileStore.isInfoModalOpen && <InfoModal />}
    </View>
  );
});

const useClasses = makeClasses({
  container: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    flex: 1,
    overflowY: "auto",
  },
  files: {
    display: "flex",
    flexFlow: "row wrap",
    paddingBottom: "7rem",
    overflowY: "auto",
  },
  pagination: {
    position: "absolute",
    bottom: "0.5rem",
    left: 0,
    right: 0,
    borderRight: `3px solid ${colors.blue["800"]}`,
    borderLeft: `3px solid ${colors.blue["800"]}`,
    borderRadius: "0.5rem",
    margin: "0 auto 1rem",
    padding: "0.3rem",
    width: "fit-content",
    background: `linear-gradient(to top, ${colors.grey["900"]}, ${Color(colors.grey["900"])
      .darken(0.1)
      .string()})`,
  },
});
