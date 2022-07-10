import { shell } from "electron";
import { useState } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { deleteFiles } from "database";
import { Menu } from "@mui/material";
import { Archive, Delete, Info, Search } from "@mui/icons-material";
import { ListItem } from "components/list";
import { InfoModal } from ".";

const ContextMenu = observer(({ children, file, ...props }: any) => {
  const { fileStore } = useStores();

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
    <div {...props} onContextMenu={handleContext}>
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

      {isInfoOpen && <InfoModal file={file} setVisible={setIsInfoOpen} />}
    </div>
  );
});

export default ContextMenu;
