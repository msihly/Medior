import { Divider, DividerProps } from "@mui/material";

export interface SettingsDividerProps extends DividerProps {}

export const SettingsDivider = ({ ...props }: SettingsDividerProps) => {
  return <Divider flexItem sx={{ margin: "1rem 0" }} {...props} />;
};
