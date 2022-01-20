import Reactotron from "reactotron-react-js";
import { mst } from "reactotron-mst";

const regEx = /postProcessSnapshot|@APPLY_SNAPSHOT/;
Reactotron.use(mst({ filter: (event) => regEx.test(event.name) === false }));
Reactotron.configure().connect();

export const trackMST = (rootStore) => Reactotron.trackMstNode(rootStore);
