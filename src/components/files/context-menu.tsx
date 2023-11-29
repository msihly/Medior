import path from "path";
import { shell } from "@electron/remote";
import { ReactNode, useState } from "react";
import { observer } from "mobx-react-lite";
import { File, useStores } from "store";
import { Menu } from "@mui/material";
import { ListItem, View, ViewProps } from "components";
import { colors, copyToClipboard, makeClasses } from "utils";

export interface ContextMenuProps extends ViewProps {
  children?: ReactNode | ReactNode[];
  disabled?: boolean;
  file: File;
}

export const ContextMenu = observer(({ children, disabled, file, ...props }: ContextMenuProps) => {
  const { css } = useClasses(null);

  const rootStore = useStores();
  const { faceRecognitionStore, fileCollectionStore, fileStore } = useStores();

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
    fileCollectionStore.setSelectedFileIds([file.id]);
    fileCollectionStore.setIsCollectionManagerOpen(true);
    handleClose();
  };

  const handleDelete = () => {
    fileStore.deleteFiles({
      rootStore,
      fileIds: fileStore.getIsSelected(file.id) ? fileStore.selectedIds : [file.id],
    });
    handleClose();
  };

  const handleFaceRecognition = () => {
    faceRecognitionStore.setActiveFileId(file.id);
    faceRecognitionStore.setIsModalOpen(true);
    handleClose();
  };

  const openInfo = () => {
    fileStore.setActiveFileId(file.id);
    fileStore.setIsInfoModalOpen(true);
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
        <ListItem text="Open Natively" icon="DesktopWindows" onClick={openNatively} />

        <ListItem text="Open in Explorer" icon="Search" onClick={openInExplorer} />

        <ListItem text="Copy" icon="ContentCopy" iconEnd="ArrowRight">
          <View column>
            <ListItem text="File Path" icon="Image" onClick={copyFilePath} />

            <ListItem text="Folder Path" icon="Folder" onClick={copyFolderPath} />
          </View>
        </ListItem>

        <ListItem text="Info" icon="Info" onClick={openInfo} />

        {!file.isAnimated && (
          <ListItem text="Face Recognition" icon="Face" onClick={handleFaceRecognition} />
        )}

        <ListItem
          text={file?.isArchived ? "Delete" : "Archive"}
          icon={file?.isArchived ? "Delete" : "Archive"}
          onClick={handleDelete}
        />

        <ListItem text="Collections" icon="Collections" onClick={handleCollections} />
      </Menu>
    </View>
  );
});

const useClasses = makeClasses({
  contextMenu: {
    background: colors.grey["900"],
  },
  contextMenuInner: {
    padding: 0,
  },
});
