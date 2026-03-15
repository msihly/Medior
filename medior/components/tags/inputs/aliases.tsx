import { MultiInput, MultiInputProps } from "medior/components";

interface AliasesProps extends MultiInputProps {
  disabled?: boolean;
}

export const Aliases = (props: AliasesProps) => {
  return <MultiInput {...props} header="Aliases" hasDeleteAll />;
};
