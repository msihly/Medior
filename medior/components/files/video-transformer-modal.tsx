import { ipcRenderer } from "electron";
import { useEffect, useState } from "react";
import { Button, Comp, LoadingOverlay, Modal, Text, View } from "medior/components";
import { FileTransform, useStores } from "medior/store";
import { useCancellableLoad } from "medior/utils/client";
import { loadConfig } from "medior/utils/server";
import { ActiveTransform } from "./video-transformer-modal/active-transform";
import { ComparisonViewer } from "./video-transformer-modal/comparison-viewer";
import { MediaTransformerErrorBoundary } from "./video-transformer-modal/error-boundary";
import { TransformConfig } from "./video-transformer-modal/transform-config";
import { TransformSearch } from "./video-transformer-modal/transform-search";

export const VideoTransformerModal = Comp(() => {
  const stores = useStores();
  const store = stores.file.videoTransformer;

  const load = useCancellableLoad();

  const [comparison, setComparison] = useState<FileTransform>(null);

  useEffect(() => {
    load.run(async (signal) => {
      const config = await loadConfig(await ipcRenderer.invoke("getConfigPath"));

      signal.throwIfAborted();
      stores.applyConfig(config);

      const res = await store.createTransforms();

      if (!res.success) throw new Error(res.error);
    });
  }, []);

  const closeComparison = () => setComparison(null);

  const handleClose = () => {
    if (!store.isUpdating) {
      load.cancel();
      store.setIsOpen(false);
    }
  };

  const openComparison = () => setComparison(store.activeTransform);

  const toggleConfig = () => store.setIsConfigOpen(!store.isConfigOpen);

  return (
    <MediaTransformerErrorBoundary onClose={handleClose}>
      <Modal.Container height="100%" width="100%" onClose={handleClose}>
        <LoadingOverlay
          isLoading={load.isLoading}
          sub={!store.isUpdating && <Button text="Cancel" icon="Close" onClick={handleClose} />}
        />

        <Modal.Header>
          <Text preset="title">{"Media Transformer"}</Text>
        </Modal.Header>

        <Modal.Content dividers={false} overflow="hidden">
          <View column flex="none" height="25rem" overflow="hidden">
            <ActiveTransform onCompare={openComparison} />
          </View>

          <View column flex={1} overflow="hidden">
            {store.isConfigOpen ? <TransformConfig /> : <TransformSearch />}
          </View>
        </Modal.Content>

        <Modal.Footer>
          <Button text="Config" icon="Settings" onClick={toggleConfig} />

          <Button text="Close" icon="Close" onClick={handleClose} />
        </Modal.Footer>

        {comparison && <ComparisonViewer transform={comparison} onClose={closeComparison} />}
      </Modal.Container>
    </MediaTransformerErrorBoundary>
  );
});
