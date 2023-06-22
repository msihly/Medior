import { app } from "@electron/remote";
import { useEffect, useState } from "react";
import { BrowserRouter, HashRouter, Route, Switch } from "react-router-dom";
import { ThemeProvider, createTheme } from "@mui/material";
import { CacheProvider } from "@emotion/react";
import createCache from "@emotion/cache";
import { createRootStore, RootStoreContext } from "store";
import { ConditionalWrap, ToastContainer } from "components";
import { CarouselWindow, Home } from "views";
import "react-toastify/dist/ReactToastify.css";
import "./css/index.css";

export const rootStore = createRootStore();

const darkTheme = createTheme({ palette: { mode: "dark" } });
const muiCache = createCache({ key: "mui", prepend: true });

export const App = () => {
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
                {/* <Route path="/import-worker" component={ImportWorker} /> */}
              </Switch>
            )}
          </ConditionalWrap>

          <ToastContainer />
        </ThemeProvider>
      </CacheProvider>
    </RootStoreContext.Provider>
  );
};
