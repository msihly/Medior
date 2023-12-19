import { ReactNode } from "react";
import { View } from "components";
import { makeClasses } from "utils";

export interface DetailRowProps {
  children: ReactNode | ReactNode[];
}

export const DetailRow = ({ children }: DetailRowProps) => {
  const { css } = useClasses(null);

  return <View className={css.row}>{children}</View>;
};

const useClasses = makeClasses({
  row: {
    display: "flex",
    alignItems: "center",
    "& > *": {
      flexBasis: "100%",
      overflow: "hidden",
      "&:not(:last-child)": {
        marginRight: "1rem",
      },
    },
  },
});
