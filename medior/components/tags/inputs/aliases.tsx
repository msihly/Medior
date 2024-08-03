import { ChipInput, ChipInputProps, InputWrapper, InputWrapperProps } from "medior/components";

interface AliasesProps extends ChipInputProps {
  wrapperProps?: Partial<InputWrapperProps>;
}

export const Aliases = ({ setValue, value, wrapperProps = {}, ...inputProps }: AliasesProps) => {
  return (
    <InputWrapper label="Aliases" {...wrapperProps}>
      <ChipInput {...inputProps} {...{ setValue, value }} hasHelper />
    </InputWrapper>
  );
};
