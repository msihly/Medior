import { ipcRenderer } from "electron";
import { ReactNode, useEffect, useRef, useState } from "react";
import type { ServerProcessStatus } from "medior/server/server";
import { useStores } from "medior/store";
import { Toaster, ToastContainer } from "medior/utils/client";
import { Config, getConfig, loadConfig, setConfig, setupTRPC, socket } from "medior/utils/server";
import { Views } from "medior/views";
import "trabecula/css/react-toastify.css";
import "trabecula/css/fonts.css";
import "medior/css/view.css";

interface AppWrapperProps {
  children: ReactNode;
}

const RuntimeSync = () => {
  const stores = useStores();
  const pollInterval = useRef<ReturnType<typeof setInterval>>(null);
  const serverToaster = useRef(new Toaster()).current;
  const wasApplyingConfig = useRef(false);
  const wasDisconnected = useRef(false);

  useEffect(() => {
    const handleConfigUpdated = (_, config: Config) => {
      const previousConfig = getConfig();
      setConfig(config);
      stores.applyConfig(config);

      if (previousConfig.ports.server !== config.ports.server) setupTRPC();
      if (previousConfig.ports.socket !== config.ports.socket) {
        socket.disconnect();
        socket.connect();
      }
    };

    const handleServerStatuses = (statuses: ServerProcessStatus[]) => {
      const failed = statuses.filter(({ state }) => state === "failed");
      const unavailable = statuses.filter(({ state }) => state !== "ready");

      if (failed.length) {
        stopPolling();
        wasDisconnected.current = true;
        serverToaster.toast(
          `${failed.map(({ label }) => label).join(" / ")} failed to restart. Restart Medior.`,
          { autoClose: false, type: "error" },
        );
      } else if (unavailable.length) {
        startPolling();
        wasDisconnected.current = true;
        wasApplyingConfig.current = unavailable.every(({ isConfigRestart }) => isConfigRestart);
        serverToaster.toast(
          wasApplyingConfig.current
            ? "Applying server configuration..."
            : `${unavailable.map(({ label }) => label).join(" / ")} process unavailable. Attempting to reconnect...`,
          { autoClose: false, type: wasApplyingConfig.current ? "info" : "error" },
        );
      } else {
        stopPolling();
        if (!wasDisconnected.current) return;

        wasDisconnected.current = false;
        serverToaster.toast(
          wasApplyingConfig.current
            ? "Server configuration applied."
            : "Server processes reconnected.",
          { type: "success" },
        );
        wasApplyingConfig.current = false;
      }
    };

    const handleServerStatusChanged = (_, statuses: ServerProcessStatus[]) =>
      handleServerStatuses(statuses);

    const pollServerStatuses = async () => {
      try {
        handleServerStatuses(
          (await ipcRenderer.invoke("getServerStatuses")) as ServerProcessStatus[],
        );
      } catch (error) {
        wasDisconnected.current = true;
        startPolling();
        serverToaster.toast("Unable to check server processes. Restart Medior if this persists.", {
          autoClose: false,
          type: "error",
        });
      }
    };

    const startPolling = () => {
      if (!pollInterval.current) pollInterval.current = setInterval(pollServerStatuses, 2000);
    };

    const stopPolling = () => {
      if (!pollInterval.current) return;
      clearInterval(pollInterval.current);
      pollInterval.current = null;
    };

    ipcRenderer.on("config-updated", handleConfigUpdated);
    ipcRenderer.on("server-status-changed", handleServerStatusChanged);
    pollServerStatuses();

    return () => {
      stopPolling();
      ipcRenderer.off("config-updated", handleConfigUpdated);
      ipcRenderer.off("server-status-changed", handleServerStatusChanged);
    };
  }, []);

  return null;
};

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

        <RuntimeSync />

        {children}
      </Views.StoreProvider>
    </Views.MuiProvider>
  );
};
