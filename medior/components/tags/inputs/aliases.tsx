import { MultiInput, MultiInputProps } from "medior/components";

interface AliasesProps extends MultiInputProps {
  disabled?: boolean;
}

/** Disabled aliases can be neither typed nor deleted. */
export const Aliases = ({ disabled, inputProps, ...props }: AliasesProps) => {
  return (
    <MultiInput
      {...props}
      header="Aliases"
      hasDelete={!disabled}
      hasDeleteAll={!disabled}
      inputProps={{ ...inputProps, disabled: disabled || inputProps?.disabled }}
    />
  );
};
