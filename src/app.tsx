import { app } from "@electron/remote";
import { useEffect, useState } from "react";
import { BrowserRouter, HashRouter, Route, Switch } from "react-router-dom";
import { ThemeProvider, createTheme } from "@mui/material";
import { CacheProvider } from "@emotion/react";
import createCache from "@emotion/cache";
import { createRootStore, RootStoreContext } from "store";
import { ConditionalWrap, ToastContainer } from "components";
import { CarouselWindow, HomeWindow, SearchWindow } from "views";
import "react-toastify/dist/ReactToastify.css";
import "./css/index.css";

export const rootStore = createRootStore();

const darkTheme = createTheme({ palette: { mode: "dark" } });
const muiCache = createCache({ key: "mui", prepend: true, stylisPlugins: [] });

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
            condition={app.isPackaged !== undefined || !!process.env.BUILD_DEV}
            wrap={(children) =>
              app.isPackaged || !!process.env.BUILD_DEV ? (
                <HashRouter>{children}</HashRouter>
              ) : (
                <BrowserRouter>{children}</BrowserRouter>
              )
            }
          >
            {isLoading ? null : (
              <Switch>
                <Route exact path="/" component={HomeWindow} />
                <Route path="/carousel" component={CarouselWindow} />
                <Route path="/search" component={SearchWindow} />
              </Switch>
            )}
          </ConditionalWrap>

          <ToastContainer />
        </ThemeProvider>
      </CacheProvider>
    </RootStoreContext.Provider>
  );
};