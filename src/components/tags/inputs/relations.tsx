import { InputWrapper, InputWrapperProps, TagInput, TagInputProps } from "components";

interface RelationsProps extends Omit<TagInputProps, "label" | "onChange" | "ref"> {
  label: string;
  setValue: TagInputProps["onChange"];
  wrapperProps?: Partial<InputWrapperProps>;
}

export const Relations = ({
  label,
  options,
  setValue,
  value,
  wrapperProps = {},
  ...tagInputProps
}: RelationsProps) => {
  return (
    <InputWrapper {...{ label }} {...wrapperProps}>
      <TagInput
        {...{ options, value }}
        onChange={setValue}
        hasCreate
        hasDelete
        hasHelper
        limitTags={20}
        {...tagInputProps}
      />
    </InputWrapper>
  );
};
