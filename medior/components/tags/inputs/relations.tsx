import { Comp, TagInput, TagInputProps } from "medior/components";

interface RelationsProps extends Omit<TagInputProps, "label" | "onChange" | "ref"> {
  setValue: TagInputProps["onChange"];
}

export const Relations = Comp(({ setValue, value, ...tagInputProps }: RelationsProps) => {
  return (
    <TagInput
      {...{ value }}
      onChange={setValue}
      hasCreate
      hasDelete
      hasDeleteAll
      width="100%"
      {...tagInputProps}
    />
  );
});
