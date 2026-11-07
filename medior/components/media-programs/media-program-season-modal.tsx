import { Dispatch, SetStateAction, useState } from "react";
import { Button, Comp, Input, Modal, Text } from "medior/components";
import { colors } from "medior/utils/client";

export interface MediaProgramSeasonModalProps {
  headerText: string;
  label?: string;
  /** Resolves to whether the label was saved, which closes the modal. */
  onSave: (label: string) => Promise<boolean>;
  setVisible: Dispatch<SetStateAction<boolean>>;
}

/** Names a season; numbered names such as S03 match the metadata source's seasons. */
export const MediaProgramSeasonModal = Comp(
  ({ headerText, label = "", onSave, setVisible }: MediaProgramSeasonModalProps) => {
    const [isSaving, setIsSaving] = useState(false);
    const [value, setValue] = useState(label);

    const handleClose = () => {
      if (!isSaving) setVisible(false);
    };

    const handleSave = async () => {
      setIsSaving(true);

      try {
        if (await onSave(value.trim())) setVisible(false);
      } finally {
        setIsSaving(false);
      }
    };

    return (
      <Modal.Container isLoading={isSaving} onClose={handleClose} height="auto" width="25rem">
        <Modal.Header>
          <Text preset="title">{headerText}</Text>
        </Modal.Header>

        <Modal.Content>
          <Input header="Label" value={value} setValue={setValue} error={!value.trim()} />

          <Text color={colors.custom.lightGrey} whiteSpace="normal">
            {"Labels such as S03, Season 3, or Specials number the season for its metadata."}
          </Text>
        </Modal.Content>

        <Modal.Footer>
          <Button text="Cancel" icon="Close" onClick={handleClose} disabled={isSaving} />

          <Button
            text="Save"
            icon="Save"
            onClick={handleSave}
            disabled={isSaving || !value.trim()}
            color={colors.custom.blue}
          />
        </Modal.Footer>
      </Modal.Container>
    );
  },
);
