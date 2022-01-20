import { Portal } from "@mui/core";
import { Dialog, DialogTitle, DialogContent, DialogActions } from "@mui/material";
import { Button } from "components/buttons";
import { FileContainer } from "components/files";

const DuplicatesModal = ({ handleClose, files, isOpen }) => {
  return (
    <Portal>
      <Dialog open={isOpen} onClose={handleClose} scroll="paper">
        <DialogTitle>Duplicates</DialogTitle>

        <DialogContent dividers={true}>
          <FileContainer files={files} mode="details" />
        </DialogContent>

        <DialogActions>
          <Button onClick={handleClose}>Okay</Button>
        </DialogActions>
      </Dialog>
    </Portal>
  );
};

export default DuplicatesModal;
