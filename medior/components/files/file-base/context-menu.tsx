import { shell } from "@electron/remote";
import path from "path";
import { FileSchema } from "medior/_generated/server";
import {
  Button,
  Comp,
  ContextMenu as ContextMenuBase,
  ContextMenuProps as ContextMenuBaseProps,
  LoadingOverlay,
  Modal,
} from "medior/components";
import { FileCollectionSearch, FileSearch, FileTransformSearch, useStores } from "medior/store";
import {
  colors,
  copyToClipboard,
  openHomeView,
  openWithPlayer,
  toast,
  useCancellableLoad,
  writePlaylist,
} from "medior/utils/client";
import { CONSTANTS, durationToSeconds, VideoExt } from "medior/utils/common";
import {
  getConfig,
  getIsAudio,
  getIsImage,
  getIsRemuxable,
  getIsVideo,
  rpc,
} from "medior/utils/server";

export interface ContextMenuProps extends Omit<ContextMenuBaseProps, "id" | "menuItems"> {
  carouselFileIds?: string[];
  file: FileSchema;
  store: FileCollectionSearch | FileSearch | FileTransformSearch;
}

export const ContextMenu = Comp(
  ({ carouselFileIds, children, file, store, ...props }: ContextMenuProps) => {
    const stores = useStores();
    const fileStore = stores.file;

    const load = useCancellableLoad();

    const isPlayable = getIsAudio(file.ext) || getIsVideo(file.ext);
    const isReencodable = file.videoCodec?.length > 0 || getIsImage(file.ext);
    const isRemuxable = getIsRemuxable(file.ext);
    const spliceTimelines = file.timestamps?.filter((timeline) => timeline.pairs.length) ?? [];

    const copyFileIds = () => copyToClipboard(getActionFileIds().join("\n"), "Copied file IDs");

    const copyFilePath = () => copyToClipboard(file.path, "Copied file path");

    const copyFolderPath = () => copyToClipboard(path.dirname(file.path), "Copied folder path");

    const getActionFileIds = () =>
      "getSelectedFileIds" in store
        ? store.getSelectedFileIds(file.id)
        : store.getIsSelected(file.id)
          ? [...store.selectedIds]
          : [file.id];

    const handleAddToPlaylist = () => stores.music.setPlaylistPickerFileIds(getActionFileIds());

    // Carousels share this menu, so the drawer's views it opens show in the main window.
    const handleCollections = () =>
      openHomeView({ fileIds: getActionFileIds(), view: "collections" });

    const handleDelete = () => fileStore.confirmDeleteFiles(getActionFileIds());

    // const handleFaceRecognition = () => {
    //   stores.faceRecog.setActiveFileId(file.id);
    //   stores.faceRecog.setIsModalOpen(true);
    // };

    const handleRefresh = () => fileStore.refreshFiles({ ids: [file.id] });

    const handleReencode = () =>
      openHomeView({ fileIds: [file.id], fnType: "reencode", view: "transformer" });

    const handleRemux = () =>
      openHomeView({ fileIds: [file.id], fnType: "remux", view: "transformer" });

    const handleSimilarity = () => fileStore.similarity.open(file.id);

    const handleSplice = (timeline: FileSchema["timestamps"][number]) =>
      openHomeView({
        fileIds: [file.id],
        fnType: "splice",
        timestampPairs: [...timeline.pairs]
          .sort((a, b) => a.order - b.order)
          .map((pair) => [
            durationToSeconds(pair.startDuration),
            durationToSeconds(pair.endDuration),
          ]),
        view: "transformer",
      });

    const handleTranslate = () => fileStore.translation.open({ fileIds: getActionFileIds() });

    const handleUnarchive = () => fileStore.unarchiveFiles({ fileIds: [file.id] });

    const openInfo = () => {
      fileStore.setActiveFileId(file.id);
      fileStore.setIsInfoModalOpen(true);
    };

    const openInExplorer = () => shell.showItemInFolder(file.path);

    const openNatively = () =>
      load.run(async (signal) => {
        try {
          if (getIsAudio(file.ext)) await openWithPlayer(file.path, getConfig().music.player);
          else if (!CONSTANTS.VIDEO.EXTS.includes(file.ext as VideoExt)) shell.openPath(file.path);
          else {
            let orderedFileIds = carouselFileIds;

            if (!orderedFileIds?.length) {
              if (!("listIdsForCarousel" in store)) throw new Error("No files found");

              const fileIdsRes = await store.listIdsForCarousel();

              signal.throwIfAborted();

              if (!fileIdsRes?.success) throw new Error(fileIdsRes.error);

              orderedFileIds = fileIdsRes.data;
            }

            if (!orderedFileIds?.length) throw new Error("No files found");

            const fileIds = new Map(orderedFileIds.map((id, i) => [id, i]));
            const filesRes = await rpc.listFile(
              { args: { filter: { id: [...fileIds.keys()] }, page: 1, pageSize: fileIds.size } },
              { signal },
            );

            signal.throwIfAborted();

            if (!filesRes.success) throw new Error(filesRes.error);

            let files = [...filesRes.data.items].sort(
              (a, b) => fileIds.get(a.id) - fileIds.get(b.id),
            );

            const activeIndex = files.findIndex((f) => f.id === file.id);
            const startIndex = Math.max(activeIndex, 0);

            files = files.slice(startIndex, startIndex + 100);

            const playlistPath = await writePlaylist(
              files.map((f) => ({ path: f.path, title: f.originalName })),
              signal,
            );

            signal.throwIfAborted();
            await openWithPlayer(playlistPath, getConfig().file.videoPlayer);
          }
        } catch (error) {
          if (!signal.aborted) {
            console.error(error);
            // The default program still opens the file when the player or playlist fails.
            toast.error(`Failed to open natively: ${error.message}`);
            shell.openPath(file.path);
          }
        }
      });

    return (
      <>
        <ContextMenuBase
          {...props}
          id={file.id}
          menuItems={[
            {
              color: colors.custom.lightBlue,
              icon: "DesktopWindows",
              label: "Open Natively",
              onClick: openNatively,
            },
            {
              divider: "bottom",
              icon: "Search",
              label: "Open in Explorer",
              onClick: openInExplorer,
            },
            {
              icon: "Info",
              label: "Info",
              onClick: openInfo,
            },
            {
              icon: "Compare",
              label: "Find Similar",
              onClick: handleSimilarity,
            },
            {
              icon: "Refresh",
              label: "Refresh",
              onClick: handleRefresh,
            },
            {
              icon: "Translate",
              label: "Translate",
              onClick: handleTranslate,
            },
            {
              divider: "bottom",
              icon: "ContentCopy",
              label: "Copy",
              subItems: [
                { icon: "Image", label: "File Path", onClick: copyFilePath },
                { icon: "Folder", label: "Folder Path", onClick: copyFolderPath },
                { icon: "Abc", label: "File IDs", onClick: copyFileIds },
              ],
            },
            {
              icon: "Collections",
              label: "Collections",
              onClick: handleCollections,
            },
            isPlayable
              ? {
                  icon: "PlaylistAdd",
                  label: "Add to Playlist",
                  onClick: handleAddToPlaylist,
                }
              : null,
            // {
            //   icon: "Face",
            //   label: "Face Recognition",
            //   onClick: handleFaceRecognition,
            // },
            isRemuxable
              ? {
                  color: colors.custom.lightBlue,
                  divider: "bottom",
                  icon: "RotateRight",
                  iconProps: { rotation: 270 },
                  label: "Remux",
                  onClick: handleRemux,
                }
              : null,
            isReencodable
              ? {
                  color: colors.custom.lightBlue,
                  divider: "bottom",
                  icon: "AutoMode",
                  label: "Re-encode",
                  onClick: handleReencode,
                }
              : null,
            spliceTimelines.length
              ? {
                  color: colors.palette.teal[500],
                  divider: "bottom",
                  icon: "ContentCut",
                  label: "Splice",
                  subItems: spliceTimelines.map((timeline) => ({
                    icon: "ContentCut",
                    label: timeline.label,
                    onClick: () => handleSplice(timeline),
                  })),
                }
              : null,
            fileStore.shownSearch.isArchived
              ? {
                  color: colors.custom.green,
                  icon: "Unarchive",
                  label: "Unarchive",
                  onClick: handleUnarchive,
                }
              : null,
            {
              color: file.isArchived ? colors.custom.red : colors.custom.orange,
              divider: "top",
              icon: file.isArchived ? "Delete" : "Archive",
              label: file.isArchived ? "Delete" : "Archive",
              onClick: handleDelete,
            },
          ]}
        >
          {children}
        </ContextMenuBase>

        {load.isLoading && (
          <Modal.Container onClose={load.cancel} width="30rem" height="16rem">
            <LoadingOverlay
              isLoading
              sub={<Button text="Cancel" icon="Close" onClick={load.cancel} />}
            />
          </Modal.Container>
        )}
      </>
    );
  },
);
