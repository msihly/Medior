import { useState } from "react";
import { Button, Comp, Modal, TagInput, Text, View } from "medior/components";
import { useStores } from "medior/store";
import { colors, toast } from "medior/utils/client";

export interface MediaProgramGenresModalProps {
  onClose: () => void;
}

/** Edits the open program's genres. */
export const MediaProgramGenresModal = Comp(({ onClose }: MediaProgramGenresModalProps) => {
  const stores = useStores();
  const store = stores.mediaProgram.editor;

  const [isSaving, setIsSaving] = useState(false);

  const handleClose = () => {
    if (!isSaving) onClose();
  };

  /** The program's genre details follow through the update's socket event. */
  const handleSave = async () => {
    setIsSaving(true);

    const res = await stores.mediaProgram.updateMediaProgram({
      id: store.program.id,
      updates: { genreIds: store.genres.map((genre) => genre.id) },
    });

    setIsSaving(false);

    if (!res.success) toast.error(res.error);
    else onClose();
  };

  return (
    <Modal.Container isLoading={isSaving} onClose={handleClose} height="28rem" width="28rem">
      <Modal.Header>
        <Text preset="title">{"Genres"}</Text>
      </Modal.Header>

      <Modal.Content>
        <View column flex={1} minHeight={0}>
          <TagInput value={store.genres} onChange={store.setGenres} hasCreate hasEditor autoFocus />
        </View>
      </Modal.Content>

      <Modal.Footer>
        <Button text="Cancel" icon="Close" onClick={handleClose} disabled={isSaving} />

        <Button
          text="Save"
          icon="Save"
          onClick={handleSave}
          disabled={isSaving}
          color={colors.custom.blue}
        />
      </Modal.Footer>
    </Modal.Container>
  );
});
