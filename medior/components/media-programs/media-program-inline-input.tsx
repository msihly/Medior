import { ReactNode, useRef, useState } from "react";
import { Comp, Input, View } from "medior/components";
import { CSS, makeClasses } from "medior/utils/client";

export interface MediaProgramInlineInputProps {
  /** Shown until clicked, which swaps it for the input. */
  children: ReactNode;
  fontSize?: CSS["fontSize"];
  fontWeight?: CSS["fontWeight"];
  /** Fits larger text, which the dense input's fixed height would clip. */
  height?: CSS["height"];
  onSave: (value: string) => void;
  value: string;
  width?: CSS["width"];
}

/** Edits a value where it's shown: Enter or leaving the input saves it, and Escape discards it. */
export const MediaProgramInlineInput = Comp(
  ({
    children,
    fontSize,
    fontWeight,
    height,
    onSave,
    value,
    width,
  }: MediaProgramInlineInputProps) => {
    const { css } = useClasses(null);

    const [draft, setDraft] = useState(value);
    const [isEditing, setIsEditing] = useState(false);

    const isDiscarded = useRef(false);

    const handleBlur = () => {
      setIsEditing(false);

      if (!isDiscarded.current && draft.trim() !== value) onSave(draft.trim());
    };

    const handleEdit = () => {
      isDiscarded.current = false;
      setDraft(value);
      setIsEditing(true);
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter" || event.key === "Escape") {
        isDiscarded.current = event.key === "Escape";
        (event.target as HTMLInputElement).blur();
      }
    };

    return isEditing ? (
      <Input
        value={draft}
        setValue={setDraft}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        fontSize={fontSize}
        fontWeight={fontWeight}
        height={height}
        width={width}
        autoFocus
        dense
      />
    ) : (
      <View onClick={handleEdit} cursor="text" className={css.display}>
        {children}
      </View>
    );
  },
);

const useClasses = makeClasses({
  display: {
    borderRadius: "0.3rem",
    transition: "background-color 150ms ease",
    "&:hover": {
      backgroundColor: "rgba(255, 255, 255, 0.06)",
    },
  },
});
