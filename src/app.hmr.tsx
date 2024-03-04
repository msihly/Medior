import { useEffect, useState } from "react";
import { ThemeProvider, createTheme } from "@mui/material";
import { CacheProvider } from "@emotion/react";
import createCache from "@emotion/cache";
import { createRootStore, RootStore, RootStoreContext } from "store";
import { ToastContainer } from "components/toast";
import { HMR } from "views/hmr";
import { loadConfig, setupTRPC } from "utils";
import "react-toastify/dist/ReactToastify.css";
import "./css/index.css";

export let rootStore: RootStore;

const darkTheme = createTheme({ palette: { mode: "dark" } });
const muiCache = createCache({ key: "mui", prepend: true, stylisPlugins: [] });

export const App = () => {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      await loadConfig();
      setupTRPC();
      rootStore = createRootStore();
      setIsLoading(false);
    })();
  }, []);

  return (
    <RootStoreContext.Provider value={rootStore}>
      <CacheProvider value={muiCache}>
        <ThemeProvider theme={darkTheme}>
          {isLoading ? null : <HMR />}

          <ToastContainer />
        </ThemeProvider>
      </CacheProvider>
    </RootStoreContext.Provider>
  );
};
