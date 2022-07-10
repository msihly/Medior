import {
  Accordion as MuiAccordion,
  AccordionProps as MuiAccordionProps,
  Button,
} from "@mui/material";
import { ExpandMore } from "@mui/icons-material";
import { makeClasses } from "utils";
import { ReactNode } from "react";
import { View } from "components";

interface AccordionProps extends MuiAccordionProps {
  children: any;
  expanded: boolean;
  fullWidth?: boolean;
  header: ReactNode;
  setExpanded: (expanded: boolean) => void;
}

export const Accordion = ({
  children,
  className,
  expanded,
  fullWidth = false,
  header,
  setExpanded,
}: AccordionProps) => {
  const { classes: css, cx } = useClasses({ expanded, fullWidth });

  return (
    <MuiAccordion
      {...{ expanded }}
      TransitionProps={{ unmountOnExit: true }}
      disableGutters
      className={cx(css.accordion, className)}
    >
      <Button
        onClick={() => setExpanded(!expanded)}
        endIcon={<ExpandMore fontSize="medium" className={css.expandIcon} />}
        variant="text"
        fullWidth
        className={css.button}
      >
        {header}
      </Button>

      <View column>{children}</View>
    </MuiAccordion>
  );
};

const useClasses = makeClasses((_, { expanded, fullWidth }) => ({
  accordion: {
    margin: 0,
    padding: 0,
    width: fullWidth ? "100%" : "auto",
    background: "transparent",
    boxShadow: "none",
    "&:before": {
      display: "none",
    },
  },
  button: {
    justifyContent: "space-between",
    padding: "0.5em 1em",
    textTransform: "capitalize",
  },
  expandIcon: {
    rotate: `${expanded ? 180 : 0}deg`,
    transition: "all 200ms ease-in-out",
  },
}));
