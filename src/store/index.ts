import { createContext, useContext } from "react";
import { RootStore, RootStoreModel } from "./root-store";

export const RootStoreContext = createContext<RootStore>({} as RootStore);

export const createRootStore = () => RootStoreModel.create({});

export const useStores = () => useContext(RootStoreContext);
