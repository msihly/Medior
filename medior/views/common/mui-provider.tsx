import { StrictMode, useRef } from "react";
import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { createTheme, ThemeProvider } from "@mui/material";
import { CONSTANTS } from "medior/utils/common";

export const MuiProvider = ({ children }: { children: React.ReactNode }) => {
  const themeRef = useRef(
    createTheme({
      components: {
        MuiDialog: {
          styleOverrides: { root: { top: CONSTANTS.WINDOW.TITLE_BAR.HEIGHT } },
        },
      },
      palette: { mode: "dark" },
    }),
  );
  const muiCacheRef = useRef(createCache({ key: "mui", prepend: true, stylisPlugins: [] }));

  return (
    <StrictMode>
      <CacheProvider value={muiCacheRef.current}>
        <ThemeProvider theme={themeRef.current}>{children}</ThemeProvider>
      </CacheProvider>
    </StrictMode>
  );
};
