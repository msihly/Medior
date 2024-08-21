import { ReactNode, useEffect, useState } from "react";
import { Views } from "medior/views";
import { loadConfig, setupTRPC } from "medior/utils";
import { ToastContainer } from "medior/components";
import "react-toastify/dist/ReactToastify.css";
import "medior/css/index.css";

interface AppWrapperProps {
  children: ReactNode;
}

export const AppWrapper = ({ children }: AppWrapperProps) => {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      await loadConfig();
      setupTRPC();
      setIsLoading(false);
    })();
  }, []);

  return isLoading ? null : (
    <Views.MuiProvider>
      <Views.StoreProvider>
        <ToastContainer />

        {children}
      </Views.StoreProvider>
    </Views.MuiProvider>
  );
};
