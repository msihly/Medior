import { ReactNode } from "react";
import { View } from "medior/components";
import { makeClasses } from "medior/utils";

interface FooterProps {
  children?: ReactNode | ReactNode[];
}

export const Footer = ({ children }: FooterProps) => {
  const { css } = useClasses(null);

  return <View className={css.footer}>{children}</View>;
};

const useClasses = makeClasses({
  footer: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomLeftRadius: "inherit",
    borderBottomRightRadius: "inherit",
    padding: "0.1rem 0.3rem",
    height: 35,
    backgroundColor: "inherit",
  },
});
