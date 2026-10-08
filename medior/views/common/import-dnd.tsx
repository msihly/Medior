import { Comp, DropOverlay, View } from "medior/components";
import { handleIngest, useStores } from "medior/store";

export const ImportDnD = Comp(({ children }: { children: JSX.Element | JSX.Element[] }) => {
  const stores = useStores();
  const store = stores.home;

  const handleDragEnter = (event: React.DragEvent) => {
    const items = [...event.dataTransfer.items].filter((item) => item.kind === "file");

    if (items.length > 0 && !store.isDraggingOut) store.setIsDraggingIn(true);
  };

  const handleDragLeave = () => store.setIsDraggingIn(false);

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleFileDrop = (event: React.DragEvent) => {
    store.setIsDraggingIn(false);
    handleIngest({ fileList: event.dataTransfer.files, store: stores.import.ingester });
  };

  return (
    <View onDragOver={handleDragOver} onDragEnter={handleDragEnter}>
      {store.isDraggingIn && <DropOverlay onDragLeave={handleDragLeave} onDrop={handleFileDrop} />}

      {children}
    </View>
  );
});
