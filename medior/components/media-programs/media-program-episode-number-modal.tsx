import { Dispatch, SetStateAction, useState } from "react";
import { Button, Comp, Dropdown, Modal, NumInput, Text } from "medior/components";
import { colors } from "medior/utils/client";
import { Fmt } from "medior/utils/common";

export type MediaProgramEpisodeNumbering = { mode: "count" | "names"; value: number };

const MODE_OPTIONS = [
  { label: "Count Up", value: "count" },
  { label: "From File Names", value: "names" },
];

export interface MediaProgramEpisodeNumberModalProps {
  count: number;
  firstNumber: number;
  /** Resolves to whether the episodes were numbered, which closes the modal. */
  onSave: (numbering: MediaProgramEpisodeNumbering) => Promise<boolean>;
  setVisible: Dispatch<SetStateAction<boolean>>;
}

/**
 * Numbers the selected episodes up from a first number, or by the numbers their file names give
 * less an offset, which handles gaps at once. Either way places them among the season's others.
 */
export const MediaProgramEpisodeNumberModal = Comp(
  ({ count, firstNumber, onSave, setVisible }: MediaProgramEpisodeNumberModalProps) => {
    const [isSaving, setIsSaving] = useState(false);
    const [mode, setMode] = useState<MediaProgramEpisodeNumbering["mode"]>("count");
    const [offset, setOffset] = useState(0);
    const [startNumber, setStartNumber] = useState(firstNumber);

    const isNames = mode === "names";
    const value = isNames ? offset : startNumber;
    const hasError = !Number.isSafeInteger(value) || value < (isNames ? 0 : 1);

    const summary = isNames
      ? `The selected episodes take the numbers their file names give${offset ? `, less ${Fmt.commas(offset)}` : ""}, sharing any number given twice.`
      : count > 1
        ? `The ${Fmt.commas(count)} selected episodes become episodes ${Fmt.commas(startNumber)} to ${Fmt.commas(startNumber + count - 1)}.`
        : `The selected episode becomes episode ${Fmt.commas(startNumber)}.`;

    const handleClose = () => {
      if (!isSaving) setVisible(false);
    };

    const handleMode = (option: string) => setMode(option as MediaProgramEpisodeNumbering["mode"]);

    const handleSave = async () => {
      setIsSaving(true);

      try {
        if (await onSave({ mode, value })) setVisible(false);
      } finally {
        setIsSaving(false);
      }
    };

    return (
      <Modal.Container isLoading={isSaving} onClose={handleClose} height="auto" width="25rem">
        <Modal.Header>
          <Text preset="title">{"Number Episodes"}</Text>
        </Modal.Header>

        <Modal.Content spacing="0.5rem">
          <Dropdown header="Numbering" options={MODE_OPTIONS} value={mode} setValue={handleMode} />

          {isNames ? (
            <NumInput
              header="Subtract From File Names"
              value={offset}
              setValue={setOffset}
              minValue={0}
              error={hasError}
              textAlign="center"
            />
          ) : (
            <NumInput
              header="First Episode"
              value={startNumber}
              setValue={setStartNumber}
              minValue={1}
              error={hasError}
              autoFocus
              textAlign="center"
            />
          )}

          <Text color={colors.custom.lightGrey} whiteSpace="normal">
            {hasError
              ? isNames
                ? "The amount to subtract can't be negative."
                : "Episode numbers start at 1."
              : `${summary} Episodes with those numbers move after them.`}
          </Text>
        </Modal.Content>

        <Modal.Footer>
          <Button text="Cancel" icon="Close" onClick={handleClose} disabled={isSaving} />

          <Button
            text="Save"
            icon="Save"
            onClick={handleSave}
            disabled={isSaving || hasError}
            color={colors.custom.blue}
          />
        </Modal.Footer>
      </Modal.Container>
    );
  },
);
