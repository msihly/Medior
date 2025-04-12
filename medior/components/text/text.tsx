import { ElementType } from "react";
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { Typography, TypographyProps } from "@mui/material";
import { TooltipProps, TooltipWrapper } from "medior/components";
import { colors, CSS, makeClasses } from "medior/utils/client";

export type TextPreset = "default" | "detail-label" | "label-glow" | "sub-text" | "title";

const PRESETS: Record<TextPreset, CSS> = {
  "default": {
    fontSize: "1em",
    fontWeight: 400,
    overflow: "hidden",
  },
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

export interface TextProps
  extends Omit<
    TypographyProps,
    "color" | "component" | "fontSize" | "fontWeight" | "overflow" | "title"
  > {
  color?: string;
  component?: ElementType;
  fontSize?: CSS["fontSize"];
  fontWeight?: CSS["fontWeight"];
  overflow?: CSS["overflow"];
  preset?: TextPreset;
  tooltip?: TooltipProps["title"];
  tooltipProps?: Partial<TooltipProps>;
}

export const Text = ({
  children,
  className,
  color,
  component = "span",
  fontSize,
  fontWeight,
  overflow,
  preset = "default",
  tooltip,
  tooltipProps,
  ...props
}: TextProps) => {
  const { css, cx } = useClasses({ color, fontSize, fontWeight, overflow, preset });

  return (
    <TooltipWrapper {...{ tooltip, tooltipProps }}>
      <Typography {...{ component }} {...props} className={cx(css.root, className)}>
        {children}
      </Typography>
    </TooltipWrapper>
  );
};

interface ClassesProps {
  color: string;
  fontSize: CSS["fontSize"];
  fontWeight: CSS["fontWeight"];
  overflow: CSS["overflow"];
  preset: TextProps["preset"];
}

const useClasses = makeClasses((props: ClassesProps) => {
  const preset = PRESETS[props.preset];
  return {
    root: {
      ...preset,
      color: props.color ?? preset?.color,
      fontSize: props.fontSize ?? preset?.fontSize,
      fontWeight: props.fontWeight ?? preset?.fontWeight,
      overflow: props.overflow ?? preset?.overflow,
    },
  };
});
