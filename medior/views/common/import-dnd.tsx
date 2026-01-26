import Color from "color";
import { Comp, View } from "medior/components";
import { handleIngest, useStores } from "medior/store";
import { colors, makeClasses } from "medior/utils/client";

export const ImportDnD = Comp(({ children }: { children: JSX.Element | JSX.Element[] }) => {
  const { css } = useClasses(null);

  const stores = useStores();

  const handleDragEnter = (event: React.DragEvent) => {
    const items = [...event.dataTransfer.items].filter((item) => item.kind === "file");
    if (items.length > 0 && !stores.home.isDraggingOut) stores.home.setIsDraggingIn(true);
  };

  const handleDragLeave = () => stores.home.setIsDraggingIn(false);

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleFileDrop = (event: React.DragEvent) => {
    stores.home.setIsDraggingIn(false);
    handleIngest({ fileList: event.dataTransfer.files, store: stores.import.ingester });
  };

  return (
    <View onDragOver={handleDragOver} onDragEnter={handleDragEnter}>
      {stores.home.isDraggingIn && (
        <View onDragLeave={handleDragLeave} onDrop={handleFileDrop} className={css.overlay} />
      )}

      {children}
    </View>
  );
});

const useClasses = makeClasses({
  overlay: {
    position: "fixed",
    top: 0,
    bottom: 0,
    right: 0,
    left: 0,
    border: `15px dashed ${colors.custom.blue}`,
    backgroundColor: Color(colors.custom.blue).fade(0.5).string(),
    opacity: 0.3,
    zIndex: 5000, // necessary for MUI z-index values
  },
});
