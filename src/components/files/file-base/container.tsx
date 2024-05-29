import { MouseEvent, ReactNode } from "react";
import { Paper } from "@mui/material";
import { View, ViewProps } from "components";
import { CSSObject } from "tss-react";
import { colors, makeClasses } from "utils";
import Color from "color";

interface ContainerProps extends ViewProps {
  children: ReactNode | ReactNode[];
  className?: string;
  disabled?: boolean;
  display?: CSSObject["display"];
  height?: CSSObject["height"];
  onClick?: (event: MouseEvent) => void;
  onDoubleClick?: () => void;
  selected?: boolean;
  selectedColor?: string;
  width?: CSSObject["width"];
}

export const Container = ({
  children,
  className,
  disabled,
  display = "block",
  height,
  onClick,
  onDoubleClick,
  selected,
  selectedColor = colors.blue["900"],
  width,
  ...viewProps
}: ContainerProps) => {
  const { css, cx } = useClasses({ disabled, display, height, selected, selectedColor, width });

  return (
    <View {...viewProps} className={cx(css.container, className)}>
      <Paper
        onClick={!disabled ? onClick : undefined}
        onDoubleClick={!disabled ? onDoubleClick : undefined}
        elevation={3}
        className={css.paper}
      >
        {children}
      </Paper>
    </View>
  );
};

interface ClassesProps {
  disabled?: boolean;
  display: CSSObject["display"];
  height?: CSSObject["height"];
  selected?: boolean;
  selectedColor: string;
  width?: CSSObject["width"];
}

const useClasses = makeClasses(
  (_, { disabled, display, height, selected, selectedColor, width }: ClassesProps) => ({
    container: {
      position: "relative",
      display,
      border: "1px solid transparent",
      borderRadius: 4,
      padding: "0.25rem",
      height: height ?? "fit-content",
      ...(width ? { width } : {}),
      background:
        !disabled && selected
          ? `linear-gradient(to bottom right, ${selectedColor}, ${Color(selectedColor)
              .fade(0.5)
              .string()} 60%)`
          : "transparent",
      overflow: "hidden",
      cursor: "pointer",
      userSelect: "none",
    },
    paper: {
      display: "flex",
      flexDirection: "column",
      flex: 1,
      height: "100%",
      backgroundColor: colors.grey["900"],
      userSelect: "none",
    },
  })
);
