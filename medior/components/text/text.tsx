import { ElementType } from "react";
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { Typography, TypographyProps } from "@mui/material";
import { TooltipProps, TooltipWrapper } from "medior/components";
import { colors, CSS, makeClasses } from "medior/utils";

export type TextPreset = "detail-label" | "label-glow" | "sub-text" | "title";

const PRESETS: Record<TextPreset, CSS> = {
  "detail-label": {
    color: colors.custom.lightBlue,
    fontWeight: 500,
    whiteSpace: "nowrap",
  },
  "label-glow": {
    color: colors.custom.white,
    fontSize: "0.8em",
    textAlign: "center",
    textShadow: `0 0 10px ${colors.custom.blue}`,
    overflow: "visible",
  },
  "sub-text": {
    color: colors.custom.grey,
    fontSize: "0.7em",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
  },
  title: {
    color: colors.custom.white,
    fontSize: "1.1em",
    fontWeight: 500,
    textAlign: "center",
    textOverflow: "ellipsis",
    overflow: "hidden",
    whiteSpace: "nowrap",
  },
};

export interface TextProps extends Omit<TypographyProps, "color" | "component" | "title"> {
  color?: string;
  component?: ElementType;
  preset?: TextPreset;
  tooltip?: TooltipProps["title"];
  tooltipProps?: Partial<TooltipProps>;
}

export const Text = ({
  children,
  className,
  color,
  component = "span",
  fontSize = "1em",
  fontWeight = 400,
  overflow = "hidden",
  preset,
  tooltip,
  tooltipProps,
  ...props
}: TextProps) => {
  const { css, cx } = useClasses({ color, preset });

  return (
    <TooltipWrapper {...{ tooltip, tooltipProps }}>
      <Typography
        {...{ component, fontSize, fontWeight, overflow }}
        {...props}
        className={cx(css.root, className)}
      >
        {children}
      </Typography>
    </TooltipWrapper>
  );
};

interface ClassesProps {
  color: string;
  preset: TextProps["preset"];
}

const useClasses = makeClasses((props: ClassesProps) => ({
  root: {
    color: props.color,
    ...PRESETS[props.preset],
  },
}));
