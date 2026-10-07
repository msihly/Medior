import Color from "color";
import { Comp, View } from "medior/components";
import { handleIngest, useStores } from "medior/store";
import { colors, makeClasses } from "medior/utils/client";

export const ImportDnD = Comp(({ children }: { children: JSX.Element | JSX.Element[] }) => {
  const { css } = useClasses(null);

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
      {store.isDraggingIn && (
        <View onDragLeave={handleDragLeave} onDrop={handleFileDrop} className={css.overlay} />
      )}

      {children}
    </View>
  );
});

const useClasses = makeClasses({
  overlay: {
    backgroundColor: Color(colors.custom.blue).fade(0.5).string(),
    border: `15px dashed ${colors.custom.blue}`,
    bottom: 0,
    left: 0,
    opacity: 0.3,
    position: "fixed",
    right: 0,
    top: 0,
    zIndex: 5000, // necessary for MUI z-index values
  },
});
