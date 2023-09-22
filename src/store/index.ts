import { createContext, useContext } from "react";
import { RootStore } from "./root-store";
export const RootStoreContext = createContext<RootStore>({} as RootStore);
export const useStores = () => useContext<RootStore>(RootStoreContext);

export * from "./collections";
export * from "./face-recognition";
export * from "./files";
export * from "./home";
export * from "./imports";
export * from "./root-store";
export * from "./tags";