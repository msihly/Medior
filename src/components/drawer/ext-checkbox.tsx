import { observer } from "mobx-react-lite";
import { useStores, ImageType, VideoType } from "store";
import { Checkbox } from "components";

interface ExtCheckboxProps {
  ext: ImageType | VideoType;
  label?: string;
  type: "Image" | "Video";
}

export const ExtCheckbox = observer(({ ext, label = null, type }: ExtCheckboxProps) => {
  const { homeStore } = useStores();

  return (
    <Checkbox
      label={label || ext}
      checked={
        type === "Image" ? homeStore.selectedImageTypes[ext] : homeStore.selectedVideoTypes[ext]
      }
      setChecked={(checked) =>
        type === "Image"
          ? homeStore.setSelectedImageTypes({ [ext]: checked })
          : homeStore.setSelectedVideoTypes({ [ext]: checked })
      }
    />
  );
});
