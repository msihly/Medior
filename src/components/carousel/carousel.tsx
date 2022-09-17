import { createContext, MutableRefObject, useContext, useRef } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import ReactPlayer from "react-player/file";
import Panzoom, { PanzoomObject, PanzoomOptions } from "@panzoom/panzoom";
import { View } from "components";
import { makeClasses } from "utils";

interface CarouselContextProps {
  activeFileId: string;
  panZoomRef: MutableRefObject<PanzoomObject>;
  selectedFileIds: string[];
  setActiveFileId: React.Dispatch<React.SetStateAction<string>>;
}

export const CarouselContext = createContext<CarouselContextProps>(null);

const Carousel = observer(() => {
  const { classes: css } = useClasses(null);
  const { activeFileId, panZoomRef } = useContext(CarouselContext);

  const { fileStore } = useStores();
  const activeFile = fileStore.getById(activeFileId);

  const containerRef = useRef<HTMLElement>(null);

  panZoomRef.current =
    containerRef.current !== null
      ? Panzoom(containerRef.current, {
          animate: true,
          contain: "outside",
          cursor: "grab",
          disablePan: activeFile?.isVideo,
          maxScale: 10,
          minScale: 1,
          panOnlyWhenZoomed: true,
          step: 0.1,
        } as PanzoomOptions)
      : null;

  return (
    <View ref={containerRef} onScroll={(e) => console.log(e)} className={css.viewContainer}>
      {activeFile?.isVideo ? (
        <View className={css.videoContainer}>
          <ReactPlayer
            url={activeFile?.path}
            width="100%"
            height="100%"
            controls
            playing
            loop
            muted
            volume={0}
          />
        </View>
      ) : (
        <img
          src={activeFile?.path}
          className={css.image}
          alt={activeFile?.originalName}
          draggable={false}
        />
      )}
    </View>
  );
});

export default Carousel;

const useClasses = makeClasses({
  image: {
    borderRadius: "inherit",
    width: "100%",
    objectFit: "contain",
    userSelect: "none",
  },
  videoContainer: {
    display: "flex",
    flex: 1,
  },
  viewContainer: {
    display: "flex",
    flex: 1,
    minHeight: 0,
  },
});
