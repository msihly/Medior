import { app } from "@electron/remote";
import { BrowserRouter, HashRouter, Route, Switch } from "react-router-dom";
import { ConditionalWrap } from "medior/components";
import { CarouselWindow, HomeWindow, SearchWindow, Views } from "medior/views";

export const App = () => {
  return (
    <Views.AppWrapper>
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
        <Switch>
          <Route exact path="/" component={HomeWindow} />
          <Route path="/carousel" component={CarouselWindow} />
          <Route path="/search" component={SearchWindow} />
        </Switch>
      </ConditionalWrap>
    </Views.AppWrapper>
  );
};
