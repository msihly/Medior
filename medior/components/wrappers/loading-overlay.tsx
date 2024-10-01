import { Text, View } from "medior/components";
import { CircularProgress } from "@mui/material";
import { makeClasses } from "medior/utils";
import { ReactNode } from "react";

export interface LoadingOverlayProps {
  children?: ReactNode | ReactNode[];
  isLoading: boolean;
  sub?: ReactNode;
}

export const LoadingOverlay = ({ children, isLoading, sub }: LoadingOverlayProps) => {
  const { css } = useClasses({ isLoading });

  return (
    <>
      {children}

      <View
        column
        align="center"
        justify="center"
        spacing="1rem"
        height="100%"
        width="100%"
        opacity={isLoading ? 1 : 0}
        className={css.loadingOverlay}
      >
        <CircularProgress color="inherit" />

        {typeof sub === "string" ? (
          <Text preset="title" fontSize="0.9em">
            {sub}
          </Text>
        ) : (
          sub
        )}
      </View>
    </>
  );
};

interface ClassesProps {
  isLoading: boolean;
}

const useClasses = makeClasses((props: ClassesProps) => ({
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    zIndex: 100,
    transition: "all 225ms ease-in-out",
    pointerEvents: props.isLoading ? "auto" : "none",
  },
}));
