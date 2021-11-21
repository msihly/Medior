import React from "react";
import { Portal } from "@mui/core";
import { Dialog, DialogTitle, DialogContent, DialogActions } from "@mui/material";
import { Button } from "components/buttons";
import { ImageContainer } from "components/images";

const DuplicatesModal = ({ handleClose, images, isOpen }) => {
  return (
    <Portal>
      <Dialog open={isOpen} onClose={handleClose} scroll="paper">
        <DialogTitle>Duplicates</DialogTitle>

        <DialogContent dividers={true}>
          <ImageContainer {...{ images }} />
        </DialogContent>

        <DialogActions>
          <Button onClick={handleClose}>Okay</Button>
        </DialogActions>
      </Dialog>
    </Portal>
  );
};

export default DuplicatesModal;
