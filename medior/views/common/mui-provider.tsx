import { StrictMode, useState } from "react";
import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { ThemeProvider } from "@mui/material";
import { makeTheme } from "medior/components";
import { CONSTANTS } from "medior/utils/common";

export const MuiProvider = ({ children }: { children: React.ReactNode }) => {
  const [theme] = useState(() => makeTheme({ titleBarHeight: CONSTANTS.WINDOW.TITLE_BAR.HEIGHT }));

  const [muiCache] = useState(() => createCache({ key: "mui", prepend: true, stylisPlugins: [] }));

  return (
    <StrictMode>
      <CacheProvider value={muiCache}>
        <ThemeProvider theme={theme}>{children}</ThemeProvider>
      </CacheProvider>
    </StrictMode>
  );
};
