import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { FileGrid, Text, View } from "components";
import { makeClasses } from "utils";
import { useEffect, useState } from "react";

const CarouselWindow = observer(() => {
  const { fileStore } = useStores();

  const { classes: css } = useClasses(null);
  const [activeFileId, setActiveFileId] = useState(fileStore.carouselFileId);
  const [selectedFileIds, setSelectedFileIds] = useState(fileStore.carouselSelectedFileIds);

  useEffect(() => {
    document.title = "Carousel";
    console.debug("Carousel window useEffect fired.");
  }, []);

  return (
    <View className={css.root}>
      <Text>{"Active File"}</Text>
      <FileGrid id={activeFileId} />

      <Text>{"Selected Files"}</Text>
      {selectedFileIds.map((id) => (
        <FileGrid key={id} id={id} />
      ))}
    </View>
  );
});

export default CarouselWindow;

const useClasses = makeClasses({
  root: {
    display: "flex",
    flexFlow: "column",
    height: "inherit",
    transition: "all 225ms ease-in-out",
  },
});
