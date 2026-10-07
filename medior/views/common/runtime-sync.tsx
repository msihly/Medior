import { ipcRenderer } from "electron";
import { ReactNode, useEffect, useRef, useState } from "react";
import { LoadingOverlay, Text, View, WindowTitleBar } from "medior/components";
import type { ServerProcessStatus } from "medior/server/server";
import { useStores } from "medior/store";
import { persistNotification, Toaster } from "medior/utils/client";
import { Config, getConfig, setConfig, setupTRPC, socket } from "medior/utils/server";

export interface RuntimeSyncProps {
  children: ReactNode;
}

export const RuntimeSync = ({ children }: RuntimeSyncProps) => {
  const stores = useStores();

  const [hasStarted, setHasStarted] = useState(false);
  const [startupMessage, setStartupMessage] = useState("Starting Medior services...");

  const pollInterval = useRef<ReturnType<typeof setInterval>>(null);
  const previousStatusMessage = useRef<string>(null);
  const serverToaster = useRef(new Toaster()).current;
  const wasApplyingConfig = useRef(false);
  const wasDisconnected = useRef(false);

  useEffect(() => {
    let disposed = false;
    let ready = false;

    const notifyServerStatus = (
      message: string,
      type: "error" | "info" | "success",
      autoClose?: false,
    ) => {
      if (message !== previousStatusMessage.current) persistNotification(message, type);

      previousStatusMessage.current = message;
      serverToaster.toast(message, { autoClose, type });
    };

    const handleConfigUpdated = (_, config: Config) => {
      const previousConfig = getConfig();

      setConfig(config);
      stores.applyConfig(config);

      if (previousConfig.ports.server !== config.ports.server) setupTRPC();

      if (previousConfig.ports.socket !== config.ports.socket) {
        socket.reconnect();
      }
    };

    const handleServerStatuses = (statuses: ServerProcessStatus[]) => {
      if (disposed) return;

      const failed = statuses.filter(({ state }) => state === "failed");
      const unavailable = statuses.filter(({ state }) => state !== "ready");

      if (!ready) {
        if (!statuses.length || unavailable.length) {
          setStartupMessage(
            [
              failed.length
                ? `${failed.map(({ label }) => label).join(" / ")} failed to start. Close Medior and restart it.`
                : `Starting ${unavailable.map(({ label }) => label).join(" / ") || "Medior services"}...`,
              ...unavailable
                .filter(({ message }) => message)
                .map(({ label, message }) => `${label}: ${message}`),
            ].join("\n\n"),
          );
          startPolling();

          return;
        }

        ready = true;
        setHasStarted(true);
      }

      if (failed.length) {
        stopPolling();
        wasDisconnected.current = true;
        notifyServerStatus(
          `${failed.map(({ label }) => label).join(" / ")} failed to restart. Restart Medior.`,
          "error",
          false,
        );
      } else if (unavailable.length) {
        startPolling();
        wasDisconnected.current = true;
        wasApplyingConfig.current = unavailable.every(({ isConfigRestart }) => isConfigRestart);
        notifyServerStatus(
          wasApplyingConfig.current
            ? "Applying server configuration..."
            : `${unavailable.map(({ label }) => label).join(" / ")} process unavailable. Attempting to reconnect...`,
          wasApplyingConfig.current ? "info" : "error",
          false,
        );
      } else {
        stopPolling();

        if (!wasDisconnected.current) return;

        wasDisconnected.current = false;
        notifyServerStatus(
          wasApplyingConfig.current
            ? "Server configuration applied."
            : "Server processes reconnected.",
          "success",
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
      } catch {
        if (disposed) return;

        if (!ready) {
          setStartupMessage("Unable to read service status. Close Medior and restart it.");
          startPolling();

          return;
        }

        wasDisconnected.current = true;
        startPolling();
        notifyServerStatus(
          "Unable to check server processes. Restart Medior if this persists.",
          "error",
          false,
        );
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
      disposed = true;
      stopPolling();
      ipcRenderer.off("config-updated", handleConfigUpdated);
      ipcRenderer.off("server-status-changed", handleServerStatusChanged);
    };
  }, []);

  return hasStarted ? (
    <>{children}</>
  ) : (
    <View column height="100vh">
      <WindowTitleBar title="Medior" />

      <View flex={1} position="relative">
        <LoadingOverlay
          isLoading
          sub={
            <Text preset="title" fontSize="0.9em" padding="1rem" whiteSpace="pre-wrap">
              {startupMessage}
            </Text>
          }
        />
      </View>
    </View>
  );
};
