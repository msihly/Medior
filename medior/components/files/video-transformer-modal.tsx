import { ipcRenderer } from "electron";
import { useEffect } from "react";
import { Button, Comp, Modal, Text, View } from "medior/components";
import { useStores } from "medior/store";
import { loadConfig } from "medior/utils/server";
import { ActiveTransform } from "./video-transformer-modal/active-transform";
import { TransformConfig } from "./video-transformer-modal/transform-config";
import { TransformSearch } from "./video-transformer-modal/transform-search";

export const VideoTransformerModal = Comp(() => {
  const stores = useStores();

  const store = stores.file.videoTransformer;

  useEffect(() => {
    (async () => {
      const config = await loadConfig(await ipcRenderer.invoke("getConfigPath"));
      stores.home.settings.update(config);
      stores.home.settings.setHasUnsavedChanges(false);
      await store.createTransforms();
    })();
  }, []);

  const handleClose = () => store.setIsOpen(false);

  const toggleConfig = () => store.setIsConfigOpen(!store.isConfigOpen);

  return (
    <Modal.Container height="100%" width="100%" onClose={handleClose}>
      <Modal.Header>
        <Text preset="title">{"Video Transformer"}</Text>
      </Modal.Header>

      <Modal.Content dividers={false} overflow="hidden">
        <View column flex="none" height="25rem" overflow="hidden">
          <ActiveTransform />
        </View>

        <View column flex={1} overflow="hidden">
          {store.isConfigOpen ? <TransformConfig /> : <TransformSearch />}
        </View>
      </Modal.Content>

      <Modal.Footer>
        <Button text="Config" icon="Settings" onClick={toggleConfig} />

        <Button text="Close" icon="Close" onClick={handleClose} />
      </Modal.Footer>
    </Modal.Container>
  );
});
