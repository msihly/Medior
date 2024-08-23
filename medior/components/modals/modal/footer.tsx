// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { DialogActions } from "@mui/material";
import { UniformList, UniformListProps } from "medior/components";

interface FooterProps extends UniformListProps {}

export const Footer = ({ children, uniformWidth = "10rem", ...props }: FooterProps) => {
  return (
    <DialogActions>
      <UniformList
        row
        justify="center"
        spacing="0.5rem"
        width="100%"
        {...{ uniformWidth }}
        {...props}
      >
        {children}
      </UniformList>
    </DialogActions>
  );
};
