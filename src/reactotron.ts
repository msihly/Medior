import { app } from "@electron/remote";

let Reactotron = null;

if (!app.isPackaged) {
  try {
    Reactotron = require("reactotron-react-js").default;
    const { mst } = require("reactotron-mst");

    const regEx = /postProcessSnapshot|@APPLY_SNAPSHOT/;
    Reactotron.use(mst({ filter: (event) => regEx.test(event.name) === false }));
    Reactotron.configure().connect();
  } catch (err) {
    console.error("Reactotron error:", err);
  }
}

export const trackMST = (rootStore) =>
  !app.isPackaged ? Reactotron.trackMstNode(rootStore) : null;
