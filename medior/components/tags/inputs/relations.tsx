import { Comp, TagInput, TagInputProps } from "medior/components";

interface RelationsProps extends Omit<TagInputProps, "label" | "onChange" | "ref"> {
  ancestryTagIds?: string[];
  ancestryType?: "ancestors" | "descendants";
  setValue: TagInputProps["onChange"];
}

export const Relations = Comp(
  ({
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ancestryTagIds,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ancestryType,
    setValue,
    value,
    ...tagInputProps
  }: RelationsProps) => {
    return (
      <TagInput
        {...{ value }}
        onChange={setValue}
        hasCreate
        hasDelete
        width="100%"
        {...tagInputProps}
      />
    );
  },
);
