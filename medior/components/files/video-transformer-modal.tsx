import { ipcRenderer } from "electron";
import { useEffect, useState } from "react";
import { Button, Comp, LoadingOverlay, Modal, Text, View } from "medior/components";
import { FileTransform, FileTransformType, useStores } from "medior/store";
import { colors, toast, useCancellableLoad } from "medior/utils/client";
import { loadConfig } from "medior/utils/server";
import { ActiveTransform } from "./video-transformer-modal/active-transform";
import { ComparisonViewer } from "./video-transformer-modal/comparison-viewer";
import { MediaTransformerErrorBoundary } from "./video-transformer-modal/error-boundary";
import { ReencodeCandidates } from "./video-transformer-modal/reencode-candidates";
import { TransformConfig } from "./video-transformer-modal/transform-config";
import { TransformSearch } from "./video-transformer-modal/transform-search";

const QUEUE_TYPES: { label: string; type: FileTransformType }[] = [
  { label: "Re-encodes", type: "reencode" },
  { label: "Remuxes", type: "remux" },
  { label: "Splices", type: "splice" },
];

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

  const handleQueueType = async (type: FileTransformType) => {
    const res = await store.changeQueueType(type);
    if (!res.success) toast.error(res.error);
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

        <Modal.Header
          leftNode={
            <View row spacing="0.5rem">
              {QUEUE_TYPES.map(({ label, type }) => (
                <Button
                  key={type}
                  text={label}
                  icon={store.isTransforming && store.activeType === type ? "Autorenew" : undefined}
                  onClick={() => handleQueueType(type)}
                  disabled={load.isLoading || store.isUpdating}
                  color={store.queueType === type ? colors.custom.purple : colors.foregroundCard}
                  colorOnHover={colors.custom.purple}
                />
              ))}
            </View>
          }
        >
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
          <ReencodeCandidates />

          <Button text="Config" icon="Settings" onClick={toggleConfig} />

          <Button text="Close" icon="Close" onClick={handleClose} />
        </Modal.Footer>

        {comparison && <ComparisonViewer transform={comparison} onClose={closeComparison} />}
      </Modal.Container>
    </MediaTransformerErrorBoundary>
  );
});
