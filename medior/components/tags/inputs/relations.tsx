import { observer } from "medior/store";
import { TagInput, TagInputProps } from "medior/components";

interface RelationsProps extends Omit<TagInputProps, "label" | "onChange" | "ref"> {
  ancestryTagIds?: string[];
  ancestryType?: "ancestors" | "descendants";
  setValue: TagInputProps["onChange"];
}

export const Relations = observer(
  ({
    ancestryTagIds,
    ancestryType,
    options,
    setValue,
    value,
    ...tagInputProps
  }: RelationsProps) => {
    // TOOD: Show ancestry / descendants below input with a toggle button in header
    return (
      <TagInput
        {...{ options, value }}
        onChange={setValue}
        hasCreate
        hasDelete
        width="100%"
        {...tagInputProps}
      />
    );
  }
);
