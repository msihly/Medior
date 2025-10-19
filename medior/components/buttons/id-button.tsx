import { Button, ButtonProps } from "medior/components";
import { colors, copyToClipboard } from "medior/utils/client";

export interface IdButtonProps extends ButtonProps {
  value: string;
}

export const IdButton = ({ value, ...props }: IdButtonProps) => {
  const onClick = () => copyToClipboard(value, `Copied ID`);

  return <Button text="ID" onClick={onClick} color={colors.custom.black} {...props} />;
};
