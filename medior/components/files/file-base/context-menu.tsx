import path from "path";
import { shell } from "@electron/remote";
import { ReactNode } from "react";
import { observer, useStores } from "medior/store";
import { ContextMenu as ContextMenuBase, ViewProps } from "medior/components";
import { copyToClipboard } from "medior/utils";
import { toast } from "react-toastify";
import { FileSchema } from "medior/database";

const DEFAULT_OPTIONS = {
  collections: true,
  copy: true,
  delete: true,
  faceRecognition: true,
  info: true,
  openInExplorer: true,
  openNatively: true,
};

type Options = Partial<typeof DEFAULT_OPTIONS>;

export interface ContextMenuProps extends ViewProps {
  children?: ReactNode | ReactNode[];
  disabled?: boolean;
  file: FileSchema;
  options?: Options;
}

export const ContextMenu = observer(
  ({ children, disabled, file, options = {}, ...props }: ContextMenuProps) => {
    options = { ...DEFAULT_OPTIONS, ...options };

    const stores = useStores();

    const copyFilePath = () => copyToClipboard(file.path, "Copied file path");

    const copyFolderPath = () => copyToClipboard(path.dirname(file.path), "Copied folder path");

    const handleCollections = () => {
      stores.collection.manager.setSelectedFileIds([file.id]);
      stores.collection.manager.setIsOpen(true);
    };

    const handleDelete = () =>
      stores.file.confirmDeleteFiles(
        stores.file.getIsSelected(file.id) ? stores.file.selectedIds : [file.id]
      );

    const handleFaceRecognition = () => {
      stores.faceRecog.setActiveFileId(file.id);
      stores.faceRecog.setIsModalOpen(true);
    };

    const handleRefresh = async () => {
      const res = await stores.file.refreshFile({ id: file.id });
      if (!res.success) toast.error("Failed to refresh info");
      else toast.success("File info refreshed");
    };

    const openInfo = () => {
      stores.file.setActiveFileId(file.id);
      stores.file.setIsInfoModalOpen(true);
    };

    const openInExplorer = () => shell.showItemInFolder(file.path);

    const openNatively = () => shell.openPath(file.path);

    return (
      <ContextMenuBase
        {...props}
        id={file.id}
        menuItems={[
          {
            label: "Open Natively",
            icon: "DesktopWindows",
            onClick: openNatively,
          },
          {
            label: "Open in Explorer",
            icon: "Search",
            onClick: openInExplorer,
          },
          {
            label: "Copy",
            icon: "ContentCopy",
            subItems: [
              {
                label: "File Path",
                icon: "Image",
                onClick: copyFilePath,
              },
              {
                label: "Folder Path",
                icon: "Folder",
                onClick: copyFolderPath,
              },
            ],
          },
          {
            label: "Info",
            icon: "Info",
            onClick: openInfo,
          },
          {
            label: "Refresh",
            icon: "Refresh",
            onClick: handleRefresh,
          },
          {
            label: "Face Recognition",
            icon: "Face",
            onClick: handleFaceRecognition,
          },
          {
            label: "Collections",
            icon: "Collections",
            onClick: handleCollections,
          },
          {
            label: file.isArchived ? "Delete" : "Archive",
            icon: file.isArchived ? "Delete" : "Archive",
            onClick: handleDelete,
          },
        ]}
      >
        {children}
      </ContextMenuBase>
    );
  }
);
