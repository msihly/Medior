import {
  Accordion as MuiAccordion,
  AccordionProps as MuiAccordionProps,
  Button,
  Typography,
} from "@mui/material";
import { ExpandMore } from "@mui/icons-material";
import { CSSObject } from "tss-react";
import { makeStyles } from "utils";

interface AccordionProps extends MuiAccordionProps {
  children: any;
  expanded: boolean;
  fullWidth?: boolean;
  label: string;
  setExpanded: (expanded: boolean) => void;
}

export const Accordion = ({
  children,
  expanded,
  fullWidth = false,
  label,
  setExpanded,
}: AccordionProps) => {
  const { classes: css } = useClasses({ expanded, fullWidth });

  return (
    <MuiAccordion {...{ expanded }} disableGutters className={css.accordion}>
      <Button
        onClick={() => setExpanded(!expanded)}
        endIcon={<ExpandMore fontSize="medium" className={css.expandIcon} />}
        variant="text"
        fullWidth
        className={css.button}
      >
        <Typography>{label}</Typography>
      </Button>
      <div className={css.body}>{children}</div>
    </MuiAccordion>
  );
};

const useClasses = makeStyles<CSSObject>()((_, { expanded, fullWidth }) => ({
  accordion: {
    padding: "0.3rem",
    width: fullWidth ? "100%" : "auto",
    background: "transparent",
    boxShadow: "none",
    "&:before": {
      display: "none",
    },
  },
  body: {
    display: "flex",
    flexDirection: "column",
  },
  button: {
    justifyContent: "space-between",
    textTransform: "capitalize",
    padding: "0.5em",
  },
  expandIcon: {
    rotate: `${expanded ? 180 : 0}deg`,
    transition: "all 200ms ease-in-out",
  },
}));
