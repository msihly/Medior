import { ipcRenderer } from "electron";
import { ReactNode, useEffect, useState } from "react";
import { Text, View } from "medior/components";
import { colors, ToastContainer } from "medior/utils/client";
import { loadConfig, setupRpc } from "medior/utils/server";
import { Views } from "medior/views";
import { RuntimeSync } from "./runtime-sync";
import "trabecula/css/react-toastify.css";
import "trabecula/css/fonts.css";
import "medior/css/view.css";

interface AppWrapperProps {
  children: ReactNode;
}

export const AppWrapper = ({ children }: AppWrapperProps) => {
  const [error, setError] = useState<string>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        await loadConfig(await ipcRenderer.invoke("getConfigPath"));
        setupRpc();
      } catch (err) {
        console.error(err);
        setError(err?.message ?? String(err));
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  return error ? (
    <Views.MuiProvider>
      <View column align="center" justify="center" height="100vh" padding={{ all: "0 2rem" }}>
        <Text align="center" color={colors.custom.red} overflowWrap="anywhere" whiteSpace="normal">
          {`Failed to start Medior: ${error}`}
        </Text>
      </View>
    </Views.MuiProvider>
  ) : isLoading ? null : (
    <Views.MuiProvider>
      <Views.StoreProvider>
        <ToastContainer />

        <RuntimeSync>{children}</RuntimeSync>
      </Views.StoreProvider>
    </Views.MuiProvider>
  );
};
