import { app } from "@electron/remote";
import { BrowserRouter, HashRouter, Route, Routes } from "react-router";
import { CarouselWindow, HomeWindow, SearchWindow, Views } from "medior/views";

export const App = () => {
  const routes = (
    <Routes>
      <Route path="/" element={<HomeWindow />} />

      <Route path="/carousel" element={<CarouselWindow />} />

      <Route path="/search" element={<SearchWindow />} />
    </Routes>
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
