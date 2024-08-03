import path from "path";
import { shell } from "@electron/remote";
import { ReactNode, useState } from "react";
import { File, observer, useStores } from "medior/store";
import { Menu } from "@mui/material";
import { ListItem, View, ViewProps } from "medior/components";
import { colors, copyToClipboard, makeClasses } from "medior/utils";

interface Options {
  collections?: boolean;
  copy?: boolean;
  delete?: boolean;
  faceRecognition?: boolean;
  info?: boolean;
  openInExplorer?: boolean;
  openNatively?: boolean;
}

const DEFAULT_OPTIONS: Options = {
  collections: true,
  copy: true,
  delete: true,
  faceRecognition: true,
  info: true,
  openInExplorer: true,
  openNatively: true,
};

export interface ContextMenuProps extends ViewProps {
  children?: ReactNode | ReactNode[];
  disabled?: boolean;
  file: File;
  options?: Partial<Options>;
}

export const ContextMenu = observer(
  ({ children, disabled, file, options = {}, ...props }: ContextMenuProps) => {
    options = { ...DEFAULT_OPTIONS, ...options };

    const { css } = useClasses(null);

    const stores = useStores();

    const [mouseX, setMouseX] = useState(null);
    const [mouseY, setMouseY] = useState(null);

    const copyFilePath = () => copyToClipboard(file.path, "Copied file path");

    const copyFolderPath = () => copyToClipboard(path.dirname(file.path), "Copied folder path");

    const handleContext = (event) => {
      event.preventDefault();
      if (disabled) return;
      setMouseX(event.clientX - 2);
      setMouseY(event.clientY - 4);
    };

    const handleClose = () => {
      setMouseX(null);
      setMouseY(null);
    };

    const handleCollections = () => {
      stores.collection.setManagerFileIds([file.id]);
      stores.collection.setIsManagerOpen(true);
      handleClose();
    };

    const handleDelete = () => {
      stores.file.confirmDeleteFiles(
        stores.file.getIsSelected(file.id) ? stores.file.selectedIds : [file.id]
      );
      handleClose();
    };

    const handleFaceRecognition = () => {
      stores.faceRecog.setActiveFileId(file.id);
      stores.faceRecog.setIsModalOpen(true);
      handleClose();
    };

    const openInfo = () => {
      stores.file.setActiveFileId(file.id);
      stores.file.setIsInfoModalOpen(true);
      handleClose();
    };

    const openInExplorer = () => {
      shell.showItemInFolder(file.path);
      handleClose();
    };

    const openNatively = () => {
      shell.openPath(file.path);
      handleClose();
    };

    return (
      <View {...props} id={file.id} onContextMenu={handleContext}>
        {children}

        <Menu
          open={mouseY !== null}
          onClose={handleClose}
          anchorReference="anchorPosition"
          anchorPosition={
            mouseX !== null && mouseY !== null ? { top: mouseY, left: mouseX } : undefined
          }
          PopoverClasses={{ paper: css.contextMenu }}
          MenuListProps={{ className: css.contextMenuInner }}
        >
          {options.openNatively && (
            <ListItem text="Open Natively" icon="DesktopWindows" onClick={openNatively} />
          )}

          {options.openInExplorer && (
            <ListItem text="Open in Explorer" icon="Search" onClick={openInExplorer} />
          )}

          {options.copy && (
            <ListItem text="Copy" icon="ContentCopy" iconEnd="ArrowRight">
              <View column>
                <ListItem text="File Path" icon="Image" onClick={copyFilePath} />

                <ListItem text="Folder Path" icon="Folder" onClick={copyFolderPath} />
              </View>
            </ListItem>
          )}

          {options.info && <ListItem text="Info" icon="Info" onClick={openInfo} />}

          {options.faceRecognition && !file.isAnimated && (
            <ListItem text="Face Recognition" icon="Face" onClick={handleFaceRecognition} />
          )}

          {options.delete && (
            <ListItem
              text={file?.isArchived ? "Delete" : "Archive"}
              icon={file?.isArchived ? "Delete" : "Archive"}
              onClick={handleDelete}
            />
          )}

          {options.collections && (
            <ListItem text="Collections" icon="Collections" onClick={handleCollections} />
          )}
        </Menu>
      </View>
    );
  }
);

const useClasses = makeClasses({
  contextMenu: {
    background: colors.grey["900"],
  },
  contextMenuInner: {
    padding: 0,
  },
});
