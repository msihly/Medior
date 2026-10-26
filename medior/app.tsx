import { app } from "@electron/remote";
import { BrowserRouter, HashRouter, Route, Switch } from "react-router-dom";
import { CarouselWindow, HomeWindow, SearchWindow, Views } from "medior/views";

export const App = () => {
  const routes = (
    <Switch>
      <Route exact path="/" component={HomeWindow} />

      <Route path="/carousel" component={CarouselWindow} />

      <Route path="/search" component={SearchWindow} />
    </Switch>
  );

  return (
    <Views.AppWrapper>
      {app.isPackaged || !!process.env.BUILD_DEV ? (
        <HashRouter>{routes}</HashRouter>
      ) : (
        <BrowserRouter>{routes}</BrowserRouter>
      )}
    </Views.AppWrapper>
  );
};
