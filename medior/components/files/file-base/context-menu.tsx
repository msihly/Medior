import { shell } from "@electron/remote";
import fs from "fs/promises";
import path from "path";
import { ReactNode } from "react";
import { FileSchema } from "medior/_generated";
import { Comp, ContextMenu as ContextMenuBase, ViewProps } from "medior/components";
import { useStores } from "medior/store";
import { colors, copyToClipboard, getConfig, getIsRemuxable, toast } from "medior/utils/client";
import { VIDEO_EXTS, VideoExt } from "medior/utils/common";
import { trpc } from "medior/utils/server";

export interface ContextMenuProps extends ViewProps {
  children?: ReactNode | ReactNode[];
  disabled?: boolean;
  file: FileSchema;
}

export const ContextMenu = Comp(({ children, file, ...props }: ContextMenuProps) => {
  const stores = useStores();

  const isReencodable = file.videoCodec?.length > 0;
  const isRemuxable = getIsRemuxable(file.ext);

  const copyFilePath = () => copyToClipboard(file.path, "Copied file path");

  const copyFolderPath = () => copyToClipboard(path.dirname(file.path), "Copied folder path");

  const handleCollections = () => {
    stores.collection.manager.setSelectedFileIds([file.id]);
    stores.collection.manager.setIsOpen(true);
  };

  const handleDelete = () =>
    stores.file.confirmDeleteFiles(
      stores.file.search.getIsSelected(file.id) ? stores.file.search.selectedIds : [file.id],
    );

  const handleFaceRecognition = () => {
    stores.faceRecog.setActiveFileId(file.id);
    stores.faceRecog.setIsModalOpen(true);
  };

  const handleRefresh = () => stores.file.refreshFiles({ ids: [file.id] });

  const handleReencode = () => stores.file.openVideoTransformer([file.id], "reencode");

  const handleRemux = () => stores.file.openVideoTransformer([file.id], "remux");

  const handleUnarchive = () => stores.file.unarchiveFiles({ fileIds: [file.id] });

  const openInfo = () => {
    stores.file.setActiveFileId(file.id);
    stores.file.setIsInfoModalOpen(true);
  };

  const openInExplorer = () => shell.showItemInFolder(file.path);

  const openNatively = async () => {
    try {
      if (!VIDEO_EXTS.includes(file.ext as VideoExt)) shell.openPath(file.path);
      else {
        const fileIdsRes = await stores.file.search.listIdsForCarousel();
        if (!fileIdsRes.success) throw new Error(fileIdsRes.error);
        const fileIds = new Map(fileIdsRes.data.map((id, i) => [id, i]));

        const filesRes = await trpc.listFile.mutate({
          args: { filter: { id: [...fileIds.keys()] } },
        });
        if (!filesRes.success) throw new Error(filesRes.error);

        let files = [...filesRes.data.items].sort((a, b) => fileIds.get(a.id) - fileIds.get(b.id));
        const activeIndex = files.findIndex((f) => f.id === file.id);
        files = files.slice(activeIndex);

        let playlistContent = "#EXTM3U\r\n";
        for (const f of files) {
          playlistContent += `#EXTINF:0,${f.originalName}\r\n${f.path}\r\n`;
        }

        const dirPath = getConfig().db.fileStorage.locations[0];
        const playlistPath = path.resolve(dirPath, "playlist.m3u8");
        await fs.mkdir(path.dirname(playlistPath), { recursive: true });
        await fs.writeFile(playlistPath, playlistContent, "utf8");

        shell.openPath(playlistPath);
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to open playlist");
      shell.openPath(file.path);
    }
  };

  return (
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
          icon: "Refresh",
          label: "Refresh",
          onClick: handleRefresh,
        },
        {
          divider: "bottom",
          icon: "ContentCopy",
          label: "Copy",
          subItems: [
            { icon: "Image", label: "File Path", onClick: copyFilePath },
            { icon: "Folder", label: "Folder Path", onClick: copyFolderPath },
          ],
        },
        {
          icon: "Collections",
          label: "Collections",
          onClick: handleCollections,
        },
        {
          icon: "Face",
          label: "Face Recognition",
          onClick: handleFaceRecognition,
        },
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
        stores.file.search.isArchived
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
  );
});
