import electron from "electron";
import { Comp, DropOverlay, View } from "medior/components";
import { handleIngest, useStores } from "medior/store";

export const ImportDnD = Comp(
  ({ children }: { children: React.JSX.Element | React.JSX.Element[] }) => {
    const stores = useStores();
    const store = stores.home;

    const handleDragEnd = () => store.setIsDraggingOut(false);

    const handleDragEnter = (event: React.DragEvent) => {
      const items = [...event.dataTransfer.items].filter((item) => item.kind === "file");

      if (items.length > 0 && !store.isDraggingOut) store.setIsDraggingIn(true);
    };

    const handleDragLeave = () => store.setIsDraggingIn(false);

    const handleDragOver = (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };

    /** Drags that start in the app, such as of a card's image, never show the import overlay. */
    const handleDragStart = () => store.setIsDraggingOut(true);

    const handleFileDrop = (event: React.DragEvent) => {
      event.preventDefault();
      store.setIsDraggingIn(false);
      handleIngest({
        fileList: [...event.dataTransfer.files].map((file) => ({
          name: file.name,
          path: electron.webUtils.getPathForFile(file),
          type: file.type,
        })),
        store: stores.import.ingester,
      });
    };

    /** Files dropped outside the overlay, such as while dragging out, would open in a new window. */
    const handleStrayDrop = (event: React.DragEvent) => event.preventDefault();

    return (
      <View
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDrop={handleStrayDrop}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        {store.isDraggingIn && (
          <DropOverlay onDragLeave={handleDragLeave} onDrop={handleFileDrop} />
        )}

        {children}
      </View>
    );
  },
);
