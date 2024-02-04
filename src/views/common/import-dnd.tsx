import { handleIngest, useStores } from "store";
import { observer } from "mobx-react-lite";
import { View } from "components";
import { colors, makeClasses } from "utils";
import Color from "color";

export const ImportDnD = observer(({ children }) => {
  const { css } = useClasses(null);

  const rootStore = useStores();
  const { homeStore } = useStores();

  const handleDragEnter = (event: React.DragEvent) => {
    const items = [...event.dataTransfer.items].filter((item) => item.kind === "file");
    if (items.length > 0 && !homeStore.isDraggingOut) homeStore.setIsDraggingIn(true);
  };

  const handleDragLeave = () => homeStore.setIsDraggingIn(false);

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleFileDrop = (event: React.DragEvent) => {
    homeStore.setIsDraggingIn(false);
    handleIngest({ fileList: event.dataTransfer.files, rootStore });
  };

  return (
    <View onDragOver={handleDragOver} onDragEnter={handleDragEnter}>
      {homeStore.isDraggingIn && (
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
