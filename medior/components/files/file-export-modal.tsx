import { dialog } from "@electron/remote";
import {
  Button,
  Card,
  Checkbox,
  Comp,
  Dropdown,
  Icon,
  Input,
  LoadingOverlay,
  Modal,
  Text,
  View,
} from "medior/components";
import { FileCopyDestination, useStores } from "medior/store";
import { colors, toast } from "medior/utils/client";
import { FILE_SIDECAR_FIELDS, FileSidecarField, Fmt } from "medior/utils/common";
import { startFileDrag } from "./hooks";

const DESTINATION_OPTIONS: { label: string; value: FileCopyDestination }[] = [
  { label: "Original Locations", value: "original" },
  { label: "Chosen Folder", value: "folder" },
];

const FIELD_LABELS: Record<FileSidecarField, string> = {
  collections: "Collections",
  dateCreated: "Date Created",
  diffusionParams: "Diffusion Params",
  isArchived: "Archived",
  originalName: "Original Name",
  rating: "Rating",
  tagIds: "Tags",
  timestamps: "Timestamps",
  transcription: "Transcription",
};

/**
 * Copies files out under their original names and folders, moves stored files back to their
 * original paths as linked files, or drags them out with import sidecars.
 */
export const FileExportModal = Comp(() => {
  const stores = useStores();
  const store = stores.file.exporter;

  const isReady = store.sidecarPaths.length > 0;
  const isBusy = store.isPreparing || store.isStarting;
  const isFolder = store.copyDestination === "folder";

  const handleClose = () => store.setIsOpen(false);

  const handleCopy = async () => {
    const res = await store.copyFiles();
    if (!res.success) toast.error(res.error);
  };

  const handleDestination = (value: string) =>
    store.setCopyDestination(value as FileCopyDestination);

  const handleDragEnd = () => stores.home.setIsDraggingOut(false);

  const handleDragStart = (event: React.DragEvent) => {
    event.preventDefault();
    stores.home.setIsDraggingOut(true);

    startFileDrag({
      file: store.filePaths[0],
      files: [...store.filePaths, ...store.sidecarPaths, ...store.subtitlePaths],
      icon: store.thumbPath,
    });
  };

  const handleFolderClick = async (event: React.MouseEvent) => {
    event.preventDefault();

    const res = await dialog.showOpenDialog({
      defaultPath: store.copyFolder || undefined,
      properties: ["openDirectory"],
    });

    if (!res.canceled) store.setCopyFolder(res.filePaths[0]);
  };

  const handleMoveBack = async () => {
    const res = await store.moveFilesBack();
    if (!res.success) toast.error(res.error);
  };

  const handlePrepare = async () => {
    const res = await store.createSidecars();
    if (!res.success) toast.error(res.error);
  };

  return (
    <Modal.Container onClose={handleClose} width="32rem">
      <LoadingOverlay isLoading={store.isPreparing} />

      <Modal.Header>
        <Text preset="title">{`Export ${Fmt.commas(store.fileIds.length)} Files`}</Text>
      </Modal.Header>

      <Modal.Content dividers={false} spacing="0.5rem">
        <Card header="Copy Files" spacing="0.5rem">
          <Dropdown
            header="Destination"
            options={DESTINATION_OPTIONS}
            value={store.copyDestination}
            setValue={handleDestination}
          />

          {isFolder && (
            <Input
              header="Folder"
              value={store.copyFolder}
              setValue={store.setCopyFolder}
              onClick={handleFolderClick}
              placeholder="Choose a folder"
            />
          )}

          <Text color={colors.custom.lightGrey} whiteSpace="normal">
            {isFolder
              ? "Copies keep their original names, inside the folders below the one the files share. Files already there are skipped."
              : "Copies go to the files' original paths and names. Files already there are skipped."}
          </Text>

          <Button
            text="Copy"
            icon="ContentCopy"
            onClick={handleCopy}
            disabled={isBusy || (isFolder && !store.copyFolder)}
            color={colors.custom.blue}
          />
        </Card>

        <Card header="Move Back" spacing="0.5rem">
          <Text color={colors.custom.lightGrey} whiteSpace="normal">
            {
              "Moves stored files back to their original paths and names, where they stay in the library as linked files. Add their folders to Linked Folders in Settings first."
            }
          </Text>

          <Button
            text="Move Back"
            icon="DriveFileMove"
            onClick={handleMoveBack}
            disabled={isBusy}
          />
        </Card>

        <Card header="Sidecars" spacing="0.5rem">
          <View column>
            {FILE_SIDECAR_FIELDS.map((field) => (
              <Checkbox
                key={field}
                label={FIELD_LABELS[field]}
                checked={store.fields.includes(field)}
                setChecked={(checked) => store.setField(field, checked)}
                disabled={isBusy}
              />
            ))}
          </View>

          {isReady ? (
            <View
              column
              align="center"
              spacing="0.5rem"
              width="100%"
              padding={{ all: "1rem" }}
              borders={{ all: `1px dashed ${colors.custom.grey}` }}
              cursor="grab"
              draggable
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <Icon name="DragIndicator" size="2rem" />

              <Text>{`Drag ${store.filePaths.length} files with sidecars`}</Text>
            </View>
          ) : (
            <Button
              text="Prepare"
              icon="NoteAdd"
              onClick={handlePrepare}
              disabled={!store.fields.length || isBusy}
            />
          )}
        </Card>
      </Modal.Content>

      <Modal.Footer>
        <Button text="Close" icon="Close" onClick={handleClose} />
      </Modal.Footer>
    </Modal.Container>
  );
});
