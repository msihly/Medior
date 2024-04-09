import { ReactNode, useState } from "react";
import { Button, Icon, View } from "components";
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { Accordion as MuiAccordion, AccordionProps as MuiAccordionProps } from "@mui/material";
import { makeClasses } from "utils";

export interface AccordionProps extends MuiAccordionProps {
  children: ReactNode | ReactNode[];
  color?: string;
  dense?: boolean;
  expanded?: boolean;
  fullWidth?: boolean;
  header: ReactNode;
  setExpanded?: (expanded: boolean) => void;
}

export const Accordion = ({
  children,
  className,
  color = "transparent",
  dense = false,
  expanded = false,
  fullWidth = false,
  header,
  setExpanded,
}: AccordionProps) => {
  const [isExpanded, setIsExpanded] = useState(expanded);

  const handleClick = () => {
    setIsExpanded(!isExpanded);
    setExpanded?.(!isExpanded);
  };

  const { css, cx } = useClasses({ dense, expanded: isExpanded, fullWidth });

  return (
    <MuiAccordion
      expanded={isExpanded}
      disableGutters
      TransitionProps={{ unmountOnExit: true }}
      className={cx(css.accordion, className)}
    >
      <Button
        onClick={handleClick}
        endNode={<Icon name="ExpandMore" rotation={expanded ? 180 : 0} />}
        color={color}
        width="100%"
        className={css.button}
      >
        {header}
      </Button>

      <View column>{children}</View>
    </MuiAccordion>
  );
};

const useClasses = makeClasses((_, { dense, expanded, fullWidth }) => ({
  accordion: {
    margin: 0,
    padding: 0,
    width: fullWidth ? "100%" : "auto",
    background: "transparent",
    boxShadow: "none",
    "& button": {
      boxShadow: "none",
    },
    "&:before": {
      display: "none",
    },
  },
  button: {
    justifyContent: "space-between",
    borderBottomRightRadius: expanded ? 0 : undefined,
    borderBottomLeftRadius: expanded ? 0 : undefined,
    padding: dense ? "0.2rem 0.6rem" : "0.5rem 1rem",
    fontSize: "1em",
    textTransform: "capitalize",
  },
}));
