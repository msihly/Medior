import { ReactNode, useEffect, useState } from "react";
import { loadConfig, ToastContainer } from "medior/utils/client";
import { setupTRPC } from "medior/utils/server";
import { Views } from "medior/views";
import "react-toastify/dist/ReactToastify.css";
import "medior/css/fonts.css";
import "medior/css/view.css";

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
