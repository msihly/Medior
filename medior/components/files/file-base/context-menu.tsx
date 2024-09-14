import path from "path";
import { shell } from "@electron/remote";
import { ReactNode } from "react";
import { observer, useStores } from "medior/store";
import { ContextMenu as ContextMenuBase, ViewProps } from "medior/components";
import { colors, copyToClipboard } from "medior/utils";
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
  }
);
