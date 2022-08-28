import { shell } from "electron";
import { ReactNode, useState } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { deleteFiles } from "database";
import { Menu } from "@mui/material";
import { ListItem, View, ViewProps } from "components";
import { InfoModal } from ".";

interface ContextMenuProps extends ViewProps {
  children?: ReactNode | ReactNode[];
  fileId: string;
}

const ContextMenu = observer(({ children, fileId, ...props }: ContextMenuProps) => {
  const { fileCollectionStore, fileStore } = useStores();
  const file = fileStore.getById(fileId);

  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [mouseX, setMouseX] = useState(null);
  const [mouseY, setMouseY] = useState(null);

  const handleContext = (event) => {
    event.preventDefault();
    setMouseX(event.clientX - 2);
    setMouseY(event.clientY - 4);
  };

  const handleClose = () => {
    setMouseX(null);
    setMouseY(null);
  };

  const handleCollections = () => {
    fileCollectionStore.setActiveFileId(fileId);
    fileCollectionStore.setIsCollectionManagerOpen(true);
    handleClose();
  };

  const handleDelete = () => {
    deleteFiles(fileStore, file.isSelected ? fileStore.selected : [file]);
    handleClose();
  };

  const openInfo = () => {
    setIsInfoOpen(true);
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

  const listItemProps = {
    iconMargin: "0.5rem",
    paddingLeft: "0.2em",
    paddingRight: "0.5em",
  };

  return (
    <View {...props} id={fileId} onContextMenu={handleContext}>
      {children}

      <Menu
        open={mouseY !== null}
        onClose={handleClose}
        anchorReference="anchorPosition"
        anchorPosition={
          mouseX !== null && mouseY !== null ? { top: mouseY, left: mouseX } : undefined
        }
      >
        <ListItem
          text="Open Natively"
          icon="DesktopWindows"
          onClick={openNatively}
          {...listItemProps}
        />

        <ListItem
          text="Open in Explorer"
          icon="Search"
          onClick={openInExplorer}
          {...listItemProps}
        />

        <ListItem text="Info" icon="Info" onClick={openInfo} {...listItemProps} />

        <ListItem
          text="Collections"
          icon="Collections"
          onClick={handleCollections}
          {...listItemProps}
        />

        <ListItem
          text={file?.isArchived ? "Delete" : "Archive"}
          icon={file?.isArchived ? "Delete" : "Archive"}
          onClick={handleDelete}
          {...listItemProps}
        />
      </Menu>

      {isInfoOpen && <InfoModal fileId={fileId} setVisible={setIsInfoOpen} />}
    </View>
  );
});

export default ContextMenu;
