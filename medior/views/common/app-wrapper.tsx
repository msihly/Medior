import { ipcRenderer } from "electron";
import { ReactNode, useEffect, useState } from "react";
import { ToastContainer } from "medior/utils/client";
import { loadConfig, setupTRPC } from "medior/utils/server";
import { Views } from "medior/views";
import "trabecula/css/react-toastify.css";
import "trabecula/css/fonts.css";
import "medior/css/view.css";

interface AppWrapperProps {
  children: ReactNode;
}

export const AppWrapper = ({ children }: AppWrapperProps) => {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      await loadConfig(await ipcRenderer.invoke("getConfigPath"));
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
