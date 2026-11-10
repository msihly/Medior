import { app } from "@electron/remote";
import { BrowserRouter, HashRouter, Route, Routes } from "react-router";
import { CarouselWindow, HomeWindow, MusicPlayerWindow, Views } from "medior/views";

export const App = () => {
  const routes = (
    <Routes>
      <Route path="/" element={<HomeWindow />} />

      <Route path="/carousel" element={<CarouselWindow />} />

      <Route path="/music-player" element={<MusicPlayerWindow />} />
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
