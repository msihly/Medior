import { useState } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { deleteFiles } from "database";
import { Menu, MenuItem } from "@mui/material";
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

  const handleDelete = () => deleteFiles(fileStore, [file]);

  const openInfo = () => {
    setIsInfoOpen(true);
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
        <MenuItem onClick={openInfo}>Info</MenuItem>
        <MenuItem onClick={handleDelete}>Delete</MenuItem>
      </Menu>

      {isInfoOpen && <InfoModal file={file} setVisible={setIsInfoOpen} />}
    </div>
  );
});

export default ContextMenu;
