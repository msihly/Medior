import { ThemeProvider, createTheme } from "@mui/material";
import { CacheProvider } from "@emotion/react";
import createCache from "@emotion/cache";
import { createRootStore, RootStoreContext } from "store";
import { ToastContainer } from "components/toast";
import { HMR } from "views/hmr";
import "react-toastify/dist/ReactToastify.css";
import "./css/index.css";

export const rootStore = createRootStore();

const darkTheme = createTheme({ palette: { mode: "dark" } });
const muiCache = createCache({ key: "mui", prepend: true, stylisPlugins: [] });

export const App = () => {
  return (
    <RootStoreContext.Provider value={rootStore}>
      <CacheProvider value={muiCache}>
        <ThemeProvider theme={darkTheme}>
          <HMR />

          <ToastContainer />
        </ThemeProvider>
      </CacheProvider>
    </RootStoreContext.Provider>
  );
};
