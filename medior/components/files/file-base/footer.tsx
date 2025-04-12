import { ReactNode } from "react";
import { View } from "medior/components";
import { makeClasses } from "medior/utils/client";

interface FooterProps {
  children?: ReactNode | ReactNode[];
}

export const Footer = ({ children }: FooterProps) => {
  const { css } = useClasses(null);

  return <View className={css.footer}>{children}</View>;
};

const useClasses = makeClasses({
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottomLeftRadius: "inherit",
    borderBottomRightRadius: "inherit",
    padding: 0,
    height: "3rem",
    background: "linear-gradient(to bottom, transparent, black)",
  },
});
