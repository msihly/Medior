import { handleIngest, observer, useStores } from "medior/store";
import { View } from "medior/components";
import { colors, makeClasses } from "medior/utils";
import Color from "color";

export const ImportDnD = observer(({ children }) => {
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
    handleIngest({ fileList: event.dataTransfer.files, stores });
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
    border: `15px dashed ${colors.blue["600"]}`,
    backgroundColor: Color(colors.blue["800"]).fade(0.5).string(),
    opacity: 0.3,
    zIndex: 5000, // necessary for MUI z-index values
  },
});
