import { ipcRenderer } from "electron";
import { ReactNode, useEffect } from "react";
import { ServerStatusSync, WindowTitleBar } from "medior/components";
import { useStores } from "medior/store";
import { persistNotification } from "medior/utils/client";
import { Config, getConfig, setConfig, setupTRPC, socket } from "medior/utils/server";

export interface RuntimeSyncProps {
  children: ReactNode;
}

export const RuntimeSync = ({ children }: RuntimeSyncProps) => {
  const stores = useStores();

  useEffect(() => {
    const handleConfigUpdated = (_, config: Config) => {
      const previousConfig = getConfig();

      setConfig(config);
      stores.applyConfig(config);

      if (previousConfig.ports.server !== config.ports.server) setupTRPC();

      if (previousConfig.ports.socket !== config.ports.socket) socket.reconnect();
    };

    ipcRenderer.on("config-updated", handleConfigUpdated);

    return () => {
      ipcRenderer.off("config-updated", handleConfigUpdated);
    };
  }, []);

  return (
    <ServerStatusSync
      appName="Medior"
      header={<WindowTitleBar title="Medior" />}
      ipcRenderer={ipcRenderer}
      onStatusMessage={persistNotification}
      restartInstruction="Close Medior and restart it."
    >
      {children}
    </ServerStatusSync>
  );
};
