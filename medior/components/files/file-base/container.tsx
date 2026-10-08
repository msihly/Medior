import { MouseEvent, ReactNode } from "react";
import Color from "color";
import { View, ViewProps } from "medior/components";
import { colors, CSS, CssColor, makeClasses } from "medior/utils/client";

interface ContainerProps extends ViewProps {
  children: ReactNode | ReactNode[];
  className?: string;
  disabled?: boolean;
  display?: CSS["display"];
  height?: CSS["height"];
  onClick?: (event: MouseEvent) => void;
  onDoubleClick?: () => void;
  selected?: boolean;
  selectedColor?: CssColor;
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
      <View
        onClick={!disabled ? onClick : undefined}
        onDoubleClick={!disabled ? onDoubleClick : undefined}
        className={css.paper}
      >
        {children}
      </View>
    </View>
  );
};

interface ClassesProps
  extends Pick<
    ContainerProps,
    "disabled" | "display" | "height" | "selected" | "selectedColor" | "width"
  > {}

const useClasses = makeClasses((props: ClassesProps, theme) => ({
  container: {
    position: "relative",
    display: props.display,
    borderRadius: 4,
    margin: "2px",
    padding: "0.25rem",
    height: props.height ?? "20rem",
    [theme.breakpoints.down("xl")]: props.height ? undefined : { height: "18rem" },
    [theme.breakpoints.down("lg")]: props.height ? undefined : { height: "16rem" },
    [theme.breakpoints.down("md")]: props.height ? undefined : { height: "14rem" },
    [theme.breakpoints.down("sm")]: props.height ? undefined : { height: "12rem" },
    ...(props.width ? { width: props.width } : {}),
    background:
      !props.disabled && props.selected
        ? `linear-gradient(to bottom right, ${Color(props.selectedColor)
            .lighten(0.4)
            .string()}, ${props.selectedColor} 60%)`
        : "transparent",
    overflow: "hidden",
    cursor: "pointer",
    userSelect: "none",
  },
  paper: {
    backgroundImage:
      theme.palette.mode === "dark"
        ? "linear-gradient(rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.08))"
        : undefined,
    boxShadow: theme.shadows[3],
    color: theme.palette.text.primary,
    transition: theme.transitions.create("box-shadow"),
    backgroundColor: colors.background,
    borderRadius: 10,
    display: "flex",
    flex: 1,
    flexDirection: "column",
    height: "100%",
    overflow: "hidden",
    position: "relative",
    userSelect: "none",
  },
}));
