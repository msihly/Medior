import { observer, useStores } from "src/store";
import { Checkbox } from "src/components";
import { ImageType, VideoType } from "src/utils";

interface ExtCheckboxProps {
  ext: ImageType | VideoType;
  label?: string;
  type: "Image" | "Video";
}

export const ExtCheckbox = observer(({ ext, label = null, type }: ExtCheckboxProps) => {
  const stores = useStores();

  return (
    <Checkbox
      label={label || ext}
      checked={
        type === "Image" ? stores.home.selectedImageTypes[ext] : stores.home.selectedVideoTypes[ext]
      }
      setChecked={(checked) =>
        type === "Image"
          ? stores.home.setSelectedImageTypes({ [ext]: checked })
          : stores.home.setSelectedVideoTypes({ [ext]: checked })
      }
    />
  );
});
