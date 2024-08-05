import { observer, useStores } from "medior/store";
import { Checkbox } from "medior/components";
import { ImageType, VideoType } from "medior/utils";

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
        type === "Image" ? stores.file.search.selectedImageTypes[ext] : stores.file.search.selectedVideoTypes[ext]
      }
      setChecked={(checked) =>
        type === "Image"
          ? stores.file.search.setSelectedImageTypes({ [ext]: checked })
          : stores.file.search.setSelectedVideoTypes({ [ext]: checked })
      }
    />
  );
});
