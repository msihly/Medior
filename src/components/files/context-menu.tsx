import { shell } from "electron";
import { ReactNode, useState } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { deleteFiles } from "database";
import { Menu } from "@mui/material";
import { Archive, Delete, Info, Search } from "@mui/icons-material";
import { ListItem, View, ViewProps } from "components";
import { InfoModal } from ".";

interface ContextMenuProps extends ViewProps {
  children?: ReactNode | ReactNode[];
  fileId: string;
}

const ContextMenu = observer(({ children, fileId, ...props }: ContextMenuProps) => {
  const { fileStore } = useStores();
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
          text="Open in Explorer"
          icon={<Search />}
          onClick={openInExplorer}
          iconMargin="0.5rem"
          paddingLeft="0.2em"
          paddingRight="0.5em"
        />

        <ListItem
          text="Info"
          icon={<Info />}
          onClick={openInfo}
          iconMargin="0.5rem"
          paddingLeft="0.2em"
          paddingRight="0.5em"
        />

        <ListItem
          text={file.isArchived ? "Delete" : "Archive"}
          icon={file.isArchived ? <Delete /> : <Archive />}
          onClick={handleDelete}
          iconMargin="0.5rem"
          paddingLeft="0.2em"
          paddingRight="0.5em"
        />
      </Menu>

      {isInfoOpen && <InfoModal fileId={fileId} setVisible={setIsInfoOpen} />}
    </View>
  );
});

export default ContextMenu;
