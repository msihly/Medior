import { View } from "medior/components";
import { CircularProgress } from "@mui/material";
import { makeClasses } from "medior/utils";
import { ReactNode } from "react";

export interface LoadingOverlayProps {
  children?: ReactNode | ReactNode[];
  isLoading: boolean;
}

export const LoadingOverlay = ({ isLoading, children }: LoadingOverlayProps) => {
  const { css } = useClasses({ isLoading });

  return (
    <>
      {children}
      <View className={css.loadingOverlay}>
        <CircularProgress color="inherit" />
      </View>
    </>
  );
};

interface ClassesProps {
  isLoading: boolean;
}

const useClasses = makeClasses(({ isLoading }: ClassesProps) => ({
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
    height: "100%",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    zIndex: 100,
    opacity: isLoading ? 1 : 0,
    transition: "all 225ms ease-in-out",
    pointerEvents: isLoading ? "auto" : "none",
  },
}));
