import { ReactNode } from "react";
import { View } from "medior/components";
import { CSS, makeClasses } from "medior/utils/client";

interface FooterProps {
  align?: CSS["alignItems"];
  background?: CSS["background"];
  children?: ReactNode | ReactNode[];
  height?: CSS["height"];
}

export const Footer = ({
  align = "flex-end",
  background = "linear-gradient(to bottom, transparent, black)",
  children,
  height = "3rem",
}: FooterProps) => {
  const { css } = useClasses({ align, background, height });

  return <View className={css.footer}>{children}</View>;
};

interface ClassesProps extends Required<Pick<FooterProps, "align" | "background" | "height">> {}

const useClasses = makeClasses((props: ClassesProps) => ({
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: props.align,
    borderBottomLeftRadius: "inherit",
    borderBottomRightRadius: "inherit",
    padding: 0,
    height: props.height,
    background: props.background,
  },
}));
