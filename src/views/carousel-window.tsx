import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { applySnapshot } from "mobx-state-tree";
import { useStores } from "store";
import { Carousel, View } from "components";
import { makeClasses } from "utils";

const CarouselWindow = observer(() => {
  const rootStore = useStores();
  const { fileStore } = useStores();

  const { classes: css } = useClasses(null);

  const [activeFileId, setActiveFileId] = useState<string>(null);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>(null);

  useEffect(() => {
    document.title = "Carousel";
    console.debug("Carousel window useEffect fired.");

    const storedData = localStorage.getItem("mst");
    if (typeof storedData === "string") applySnapshot(rootStore, JSON.parse(storedData));

    if (!activeFileId) setActiveFileId(fileStore.carouselFileId);
    if (!selectedFileIds) setSelectedFileIds(fileStore.carouselSelectedFileIds);

    window.addEventListener("storage", (event) => {
      if (event.key === "mst") {
        const newValue = JSON.parse(event.newValue);
        if (newValue) applySnapshot(rootStore, newValue);
      }
    });
  }, []);

  return (
    <View className={css.root}>
      {/* TopBar */}

      <Carousel {...{ activeFileId, selectedFileIds, setActiveFileId }} />
    </View>
  );
});

export default CarouselWindow;

const useClasses = makeClasses({
  root: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    overflowX: "hidden",
    transition: "all 225ms ease-in-out",
  },
});
