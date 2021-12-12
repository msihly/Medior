import { combineReducers } from "redux";
import * as components from "./components";
import * as data from "./data";

const rootReducer = combineReducers({ ...components, ...data });

export default rootReducer;