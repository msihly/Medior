import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app.hmr";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
