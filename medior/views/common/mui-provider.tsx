import { StrictMode, useState } from "react";
import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { createTheme, ThemeProvider } from "@mui/material";
import { CONSTANTS } from "medior/utils/common";

export const MuiProvider = ({ children }: { children: React.ReactNode }) => {
  const [theme] = useState(() =>
    createTheme({
      components: {
        MuiDialog: {
          styleOverrides: { root: { top: CONSTANTS.WINDOW.TITLE_BAR.HEIGHT } },
        },
      },
      palette: { mode: "dark" },
    }),
  );

  const [muiCache] = useState(() => createCache({ key: "mui", prepend: true, stylisPlugins: [] }));

  return (
    <StrictMode>
      <CacheProvider value={muiCache}>
        <ThemeProvider theme={theme}>{children}</ThemeProvider>
      </CacheProvider>
    </StrictMode>
  );
};
