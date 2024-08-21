import { StrictMode, useRef } from "react";
import { createTheme, ThemeProvider } from "@mui/material";
import { CacheProvider } from "@emotion/react";
import createCache from "@emotion/cache";

export const MuiProvider = ({ children }: { children: React.ReactNode }) => {
  const themeRef = useRef(createTheme({ palette: { mode: "dark" } }));
  const muiCacheRef = useRef(createCache({ key: "mui", prepend: true, stylisPlugins: [] }));

  return (
    <StrictMode>
      <CacheProvider value={muiCacheRef.current}>
        <ThemeProvider theme={themeRef.current}>{children}</ThemeProvider>
      </CacheProvider>
    </StrictMode>
  );
};
