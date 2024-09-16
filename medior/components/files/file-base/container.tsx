import { MouseEvent, ReactNode } from "react";
import { Paper } from "@mui/material";
import { View, ViewProps } from "medior/components";
import { colors, CSS, makeClasses } from "medior/utils";
import Color from "color";

interface ContainerProps extends ViewProps {
  children: ReactNode | ReactNode[];
  className?: string;
  disabled?: boolean;
  display?: CSS["display"];
  height?: CSS["height"];
  onClick?: (event: MouseEvent) => void;
  onDoubleClick?: () => void;
  selected?: boolean;
  selectedColor?: string;
  width?: CSS["width"];
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
  selectedColor = colors.custom.blue,
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
  display: CSS["display"];
  height?: CSS["height"];
  selected?: boolean;
  selectedColor: string;
  width?: CSS["width"];
}

const useClasses = makeClasses(
  ({ disabled, display, height, selected, selectedColor, width }: ClassesProps, theme) => ({
    container: {
      position: "relative",
      display,
      border: "1px solid transparent",
      borderRadius: 4,
      padding: "0.25rem",
      height: height ?? "20rem",
      [theme.breakpoints.down("xl")]: height ? undefined : { height: "18rem" },
      [theme.breakpoints.down("lg")]: height ? undefined : { height: "16rem" },
      [theme.breakpoints.down("md")]: height ? undefined : { height: "14rem" },
      [theme.breakpoints.down("sm")]: height ? undefined : { height: "12rem" },
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
      position: "relative",
      display: "flex",
      flexDirection: "column",
      flex: 1,
      height: "100%",
      backgroundColor: colors.background,
      userSelect: "none",
    },
  })
);
