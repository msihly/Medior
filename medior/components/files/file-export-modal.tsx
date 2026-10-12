import { Button, Checkbox, Comp, Icon, LoadingOverlay, Modal, Text, View } from "medior/components";
import { useStores } from "medior/store";
import { colors, toast } from "medior/utils/client";
import { FILE_SIDECAR_FIELDS, FileSidecarField } from "medior/utils/common";
import { startFileDrag } from "./hooks";

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

export const FileExportModal = Comp(() => {
  const stores = useStores();
  const store = stores.file.exporter;

  const isReady = store.sidecarPaths.length > 0;

  const handleClose = () => store.setIsOpen(false);

  const handleDragEnd = () => stores.home.setIsDraggingOut(false);

  const handleDragStart = (event: React.DragEvent) => {
    event.preventDefault();
    stores.home.setIsDraggingOut(true);

    startFileDrag({
      file: store.filePaths[0],
      files: [...store.filePaths, ...store.sidecarPaths],
      icon: store.thumbPath,
    });
  };

  const handlePrepare = async () => {
    const res = await store.createSidecars();
    if (!res.success) toast.error(res.error);
  };

  return (
    <Modal.Container onClose={handleClose} width="24rem">
      <LoadingOverlay isLoading={store.isPreparing} />

      <Modal.Header>
        <Text preset="title">{"Export Files"}</Text>
      </Modal.Header>

      <Modal.Content dividers={false} align="center" spacing="0.5rem">
        <Text>{`Sidecar fields for ${store.fileIds.length} files`}</Text>

        <View column>
          {FILE_SIDECAR_FIELDS.map((field) => (
            <Checkbox
              key={field}
              label={FIELD_LABELS[field]}
              checked={store.fields.includes(field)}
              setChecked={(checked) => store.setField(field, checked)}
              disabled={store.isPreparing}
            />
          ))}
        </View>

        {isReady && (
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
        )}
      </Modal.Content>

      <Modal.Footer uniformWidth="7rem">
        <Button text="Close" icon="Close" onClick={handleClose} color={colors.foregroundCard} />

        <Button
          text="Prepare"
          icon="NoteAdd"
          onClick={handlePrepare}
          disabled={!store.fields.length || store.isPreparing || isReady}
          color={colors.custom.blue}
        />
      </Modal.Footer>
    </Modal.Container>
  );
});
