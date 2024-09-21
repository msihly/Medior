import { MultiInput, MultiInputProps } from "medior/components";

interface AliasesProps extends MultiInputProps {
  disabled?: boolean;
}

export const Aliases = ({ disabled, onChange, value, ...props }: AliasesProps) => {
  return <MultiInput header="Aliases" {...props} {...{ disabled, onChange, value }} />;
};
