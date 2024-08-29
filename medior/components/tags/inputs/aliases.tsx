import { ChipInput, ChipInputProps, HeaderWrapper } from "medior/components";

interface AliasesProps extends ChipInputProps {}

export const Aliases = ({ hasHelper = true, setValue, value, ...inputProps }: AliasesProps) => {
  // TODO: Replace ChipInput with a generic form of TagInputRow
  return (
    <HeaderWrapper header="Aliases" width="100%">
      <ChipInput {...inputProps} {...{ hasHelper, setValue, value }} />
    </HeaderWrapper>
  );
};
