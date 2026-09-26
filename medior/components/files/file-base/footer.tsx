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
    alignItems: props.align,
    background: props.background,
    borderBottomLeftRadius: "inherit",
    borderBottomRightRadius: "inherit",
    bottom: 0,
    display: "flex",
    flexDirection: "row",
    height: props.height,
    justifyContent: "space-between",
    left: 0,
    padding: 0,
    position: "absolute",
    right: 0,
  },
}));
