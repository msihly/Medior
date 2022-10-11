import { app } from "@electron/remote";
import { useEffect, useState } from "react";
import { BrowserRouter, HashRouter, Route, Switch } from "react-router-dom";
import { ThemeProvider, createTheme } from "@mui/material";
import { CacheProvider } from "@emotion/react";
import createCache from "@emotion/cache";
import { createRootStore, RootStoreContext } from "store";
import { ConditionalWrap } from "components";
import { CarouselWindow, Home } from "./views";
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
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    console.debug("App useEffect fired");
    setIsLoading(false);
  }, []);

  return (
    <RootStoreContext.Provider value={rootStore}>
      <CacheProvider value={muiCache}>
        <ThemeProvider theme={darkTheme}>
          <ConditionalWrap
            condition={app.isPackaged !== undefined}
            wrap={(children) =>
              app.isPackaged ? (
                <HashRouter>{children}</HashRouter>
              ) : (
                <BrowserRouter>{children}</BrowserRouter>
              )
            }
          >
            {isLoading ? null : (
              <Switch>
                <Route exact path="/" component={Home} />
                <Route path="/carousel" component={CarouselWindow} />
              </Switch>
            )}
          </ConditionalWrap>
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
