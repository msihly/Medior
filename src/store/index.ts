import { createContext, useContext } from "react";
import { RootStore, RootStoreModel } from "./root-store";

export type { RootStore };

export const createRootStore = () => RootStoreModel.create({});

export const RootStoreContext = createContext<RootStore>({} as RootStore);
export const useStores = () => useContext<RootStore>(RootStoreContext);
