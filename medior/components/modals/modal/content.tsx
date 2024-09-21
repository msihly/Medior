import { ReactNode } from "react";
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { DialogContent } from "@mui/material";
import { View, ViewProps } from "medior/components";
import { CSS, makeClasses, Padding } from "medior/utils";

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
  overflow = "inherit auto",
  padding,
  position = "relative",
  ...viewProps
}: ContentProps) => {
  const { css } = useClasses(null);

  padding = { all: `${dividers ? "0.5rem" : "0.2rem"} 1rem`, ...padding };

  return (
    <DialogContent {...{ dividers }} className={css.content}>
      <View {...{ className, overflow, padding, position }} column flex={1} {...viewProps}>
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
})
