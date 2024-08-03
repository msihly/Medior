import { Divider as DividerBase, DividerProps as DividerBaseProps } from "@mui/material";

export interface DividerProps extends DividerBaseProps {}

export const Divider = ({ ...props }: DividerProps) => {
  return <DividerBase flexItem {...props} />;
};
