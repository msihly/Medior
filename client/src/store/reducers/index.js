import { combineReducers } from "redux";
import modals from "./modals";
import inputs from "./inputs";
import observers from "./observers";

const rootReducer = combineReducers({ modals, inputs, observers });

export default rootReducer;