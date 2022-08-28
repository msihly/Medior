import { createContext } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { CarouselThumbNavigator, View } from "components";
import { makeClasses } from "utils";

export const CarouselContext = createContext<CarouselProps>(null);

interface CarouselProps {
  activeFileId: string;
  selectedFileIds: string[];
  setActiveFileId: React.Dispatch<React.SetStateAction<string>>;
}

const Carousel = observer(({ activeFileId, selectedFileIds, setActiveFileId }: CarouselProps) => {
  const { fileStore } = useStores();
  const activeFile = fileStore.getById(activeFileId);

  const { classes: css } = useClasses(null);

  return (
    <CarouselContext.Provider value={{ activeFileId, selectedFileIds, setActiveFileId }}>
      <View className={css.viewContainer}>
        <img
          src={activeFile?.path}
          className={css.image}
          alt={activeFile?.originalName}
          draggable={false}
        />
      </View>

      <CarouselThumbNavigator />
    </CarouselContext.Provider>
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
  viewContainer: {
    display: "flex",
    flex: 1,
    minHeight: 0,
  },
});
