const { remote } = require("electron");

if (!remote.app.isPackaged) {
  try {
    const Reactotron = require("reactotron-react-js");
    const { mst } = require("reactotron-mst");

    const regEx = /postProcessSnapshot|@APPLY_SNAPSHOT/;
    Reactotron.use(mst({ filter: (event) => regEx.test(event.name) === false }));
    Reactotron.configure().connect();

    exports.trackMST = (rootStore) => Reactotron.trackMstNode(rootStore);
  } catch (err) {
    console.log("Error connecting to Reactotron:", err);
  }
} else {
  exports.trackMST = (_) => null;
}
