import { ReactNode } from "react";
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { DialogContent } from "@mui/material";
import { View, ViewProps } from "medior/components";
import { CSS, makeClasses, Padding } from "medior/utils/client";

interface ContentProps extends ViewProps {
  children: ReactNode | ReactNode[];
  className?: string;
  dividers?: boolean;
  overflow?: CSS["overflow"];
  padding?: Padding;
  position?: CSS["position"];
}

export const Content = ({
  children,
  className,
  dividers = true,
  overflow = "auto",
  padding,
  position = "relative",
  ...viewProps
}: ContentProps) => {
  const { css } = useClasses(null);

  padding = { all: `${dividers ? "0.5rem" : "0.2rem"} 1rem`, ...padding };

  return (
    <DialogContent {...{ dividers }} className={css.content}>
      <View
        column
        flex={1}
        spacing="0.5rem"
        width="100%"
        height="100%"
        {...{ className, overflow, padding, position }}
        {...viewProps}
      >
        {children}
      </View>
    </DialogContent>
  );
};

const useClasses = makeClasses({
  content: {
    display: "flex",
    padding: 0,
  },
});
