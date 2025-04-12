import { StrictMode } from "react";
import ReactDOM from "react-dom";
import { App } from "./app.hmr";

ReactDOM.render(
  <StrictMode>
    <App />
  </StrictMode>,
  document.getElementById("root"),
);
