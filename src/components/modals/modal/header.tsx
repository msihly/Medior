import { ReactNode } from "react";
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { DialogTitle } from "@mui/material";
import { ConditionalWrap, View } from "src/components";
import { CSS, makeClasses } from "src/utils";

interface HeaderProps {
  children: JSX.Element | JSX.Element[];
  className?: string;
  justify?: CSS["justifyContent"];
  leftNode?: ReactNode;
  rightNode?: ReactNode;
}

export const Header = ({
  children,
  className,
  justify = "center",
  leftNode,
  rightNode,
}: HeaderProps) => {
  const { css, cx } = useClasses({ justify });

  return (
    <DialogTitle className={cx(css.root, className)}>
      <ConditionalWrap
        condition={leftNode !== undefined || rightNode !== undefined}
        wrap={(wrappedChildren) => (
          <View className={css.nodeContainer}>
            {leftNode ? (
              <View row align="center" justify="flex-start">
                {leftNode}
              </View>
            ) : (
              <View />
            )}

            {wrappedChildren}

            {rightNode ? (
              <View row align="center" justify="flex-end">
                {rightNode}
              </View>
            ) : (
              <View />
            )}
          </View>
        )}
      >
        {children}
      </ConditionalWrap>
    </DialogTitle>
  );
};

const useClasses = makeClasses((_, { justify }) => ({
  nodeContainer: {
    display: "flex",
    flexDirection: "row",
    flex: 1,
    "& > *": {
      width: "calc(100% / 3)",
    },
  },
  root: {
    display: "flex",
    flexDirection: "row",
    justifyContent: justify,
    alignItems: "center",
    padding: "0.5rem 1rem",
    textAlign: "center",
  },
}));
