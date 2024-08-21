import { useEffect, useState } from "react";
import { createRootStore, RootStoreContext } from "medior/store";

let rootStore = null;

export const StoreProvider = ({ children }: { children: React.ReactNode }) => {
  /** Prevent downstream side-effects from triggering before rootStore is initialized */
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    rootStore = createRootStore();
    setIsLoading(false);
  }, []);

  return (
    <RootStoreContext.Provider value={rootStore}>
      {isLoading ? null : children}
    </RootStoreContext.Provider>
  );
};
