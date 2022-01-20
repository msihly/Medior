import { useEffect } from "react";
import { createRootStore, RootStoreContext } from "store";
import { trackMST } from "reactotron";
import { ThemeProvider, createTheme } from "@mui/material";
import { CacheProvider } from "@emotion/react";
import createCache from "@emotion/cache";
import { Home } from "./views";
import { toast } from "react-toastify";
import "./css/index.scss";

toast.configure({
  position: "bottom-left",
  autoClose: 5000,
  hideProgressBar: false,
  newestOnTop: false,
  closeOnClick: true,
  pauseOnHover: true,
  draggable: true,
  toastClassName: "Toastify__toast--dark",
});

export const muiCache = createCache({
  key: "mui",
  prepend: true,
});

export const rootStore = createRootStore();

const App = () => {
  useEffect(() => {
    trackMST(rootStore);
  }, []);

  return (
    <RootStoreContext.Provider value={rootStore}>
      <CacheProvider value={muiCache}>
        <ThemeProvider theme={darkTheme}>
          <Home />
        </ThemeProvider>
      </CacheProvider>
    </RootStoreContext.Provider>
  );
};

export default App;

const darkTheme = createTheme({
  palette: {
    mode: "dark",
  },
});
