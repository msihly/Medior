import React, { useState } from "react";
import { useDispatch } from "react-redux";
import { actions } from "store";
// import { toast } from "react-toastify";
import { Menu, MenuItem } from "@mui/material";
import { InfoModal } from "./";

const ContextMenu = ({ children, image, ...props }) => {
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

  /* ------------------------------ BEGIN - MENU ACTIONS ------------------------------ */
  const dispatch = useDispatch();

  const [isInfoOpen, setIsInfoOpen] = useState(false);

  const handeClick = (fn) => {
    fn();
    handleClose();
  };

  const deleteImage = () => dispatch(actions.deleteImages([image]));

  const openInfo = () => setIsInfoOpen(true);
  /* ------------------------------ END - MENU ACTIONS ------------------------------ */

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
        <MenuItem onClick={() => handeClick(openInfo)}>Info</MenuItem>
        <MenuItem onClick={() => handeClick(deleteImage)}>Delete</MenuItem>
      </Menu>

      <InfoModal image={image} visible={isInfoOpen} setVisible={setIsInfoOpen} />
    </div>
  );
};

export default ContextMenu;
