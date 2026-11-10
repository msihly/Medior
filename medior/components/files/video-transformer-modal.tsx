import { ipcRenderer } from "electron";
import { useEffect, useState } from "react";
import {
  Button,
  Card,
  Comp,
  LoadingOverlay,
  Modal,
  SEARCH_HEADER_PROPS,
  Text,
  UniformList,
  View,
} from "medior/components";
import { FileTransform, FileTransformType, useStores } from "medior/store";
import { colors, toast, useCancellableLoad } from "medior/utils/client";
import { getConfig, loadConfig } from "medior/utils/server";
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

/** The Media Transformer tab, which creates the transforms of files sent to it while it shows. */
export const VideoTransformerModal = Comp(() => {
  const stores = useStores();
  const store = stores.file.videoTransformer;

  const load = useCancellableLoad();

  const [comparison, setComparison] = useState<FileTransform>(null);
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  // The saved config loads when the transformer opens and before each batch of files sent to it,
  // which waits for the batch before it.
  useEffect(() => {
    if (!store.fileIds.length) createTransforms();
  }, []);

  useEffect(() => {
    if (store.fileIds.length && !store.isUpdating) createTransforms();
  }, [store.fileIds, store.isUpdating]);

  const closeComparison = () => setComparison(null);

  const createTransforms = () =>
    load.run(async (signal) => {
      const config = await loadConfig(await ipcRenderer.invoke("getConfigPath"));

      signal.throwIfAborted();
      stores.home.settings.applyConfig(config);

      const res = await store.createTransforms();

      if (!res.success) throw new Error(res.error);
    });

  /** Config edits apply as they're made, so cancelling restores the saved config. */
  const handleCancelConfig = () => {
    stores.home.settings.applyConfig(getConfig());
    store.setIsConfigOpen(false);
  };

  const handleErrorClose = () => stores.home.openView("files");

  const handleQueueType = async (type: FileTransformType) => {
    const res = await store.changeQueueType(type);
    if (!res.success) toast.error(res.error);
  };

  const handleSaveConfig = async () => {
    setIsSavingConfig(true);

    try {
      const res = await stores.home.settings.save();
      if (!res.success) return toast.error(res.error);

      toast.success("Transform config saved");
      store.setIsConfigOpen(false);
    } finally {
      setIsSavingConfig(false);
    }
  };

  const openComparison = () => setComparison(store.activeTransform);

  const openConfig = () => store.setIsConfigOpen(true);

  return (
    <MediaTransformerErrorBoundary onClose={handleErrorClose}>
      <LoadingOverlay
        isLoading={load.isLoading}
        sub={!store.isUpdating && <Button text="Cancel" icon="Close" onClick={load.cancel} />}
      />

      <LoadingOverlay isLoading={isSavingConfig} />

      <Modal.Content dividers={false} overflow="hidden" padding={{ all: 0 }}>
        <Card
          flex={1}
          height="100%"
          overflow="hidden"
          spacing="0.5rem"
          bgColor={colors.background}
          headerProps={SEARCH_HEADER_PROPS}
          header={
            <UniformList row flex={1} justify="space-between">
              <View row align="center" spacing="0.5rem">
                {QUEUE_TYPES.map(({ label, type }) => {
                  const isActive = store.queueType === type;

                  return (
                    <Button
                      key={type}
                      text={label}
                      icon={
                        store.isTransforming && store.activeType === type ? "Autorenew" : undefined
                      }
                      onClick={() => handleQueueType(type)}
                      disabled={load.isLoading || store.isUpdating}
                      color={isActive ? colors.control : "transparent"}
                      colorOnHover={colors.control}
                      textColor={isActive ? colors.custom.white : colors.custom.lightGrey}
                    />
                  );
                })}
              </View>

              <View row justify="center" align="center">
                <Text preset="title">{"Media Transformer"}</Text>
              </View>

              <View row justify="flex-end" />
            </UniformList>
          }
        >
          <View column flex="none" height="25rem" overflow="hidden">
            <ActiveTransform onCompare={openComparison} />
          </View>

          <View column flex={1} overflow="hidden">
            {store.isConfigOpen ? <TransformConfig /> : <TransformSearch />}
          </View>
        </Card>
      </Modal.Content>

      <Modal.Footer>
        <ReencodeCandidates />

        {store.isConfigOpen ? (
          <>
            <Button text="Cancel" icon="Close" onClick={handleCancelConfig} />

            <Button
              text="Save"
              icon="Save"
              onClick={handleSaveConfig}
              disabled={!stores.home.settings.hasUnsavedChanges}
              color={stores.home.settings.hasUnsavedChanges ? colors.custom.blue : undefined}
            />
          </>
        ) : (
          <Button text="Config" icon="Settings" onClick={openConfig} />
        )}
      </Modal.Footer>

      {comparison && <ComparisonViewer transform={comparison} onClose={closeComparison} />}
    </MediaTransformerErrorBoundary>
  );
});
