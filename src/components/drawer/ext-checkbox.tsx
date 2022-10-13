import { useContext } from "react";
import { HomeContext } from "views";
import { Checkbox } from "components";
import { ImageType, VideoType } from "store/files";

interface ExtCheckboxProps {
  ext: ImageType | VideoType;
  label?: string;
  type: "Image" | "Video";
}

const ExtCheckbox = ({ ext, label = null, type }: ExtCheckboxProps) => {
  const context = useContext(HomeContext);
  return (
    <Checkbox
      label={label || ext}
      checked={type === "Image" ? context.selectedImageTypes[ext] : context.selectedVideoTypes[ext]}
      setChecked={(checked) =>
        type === "Image"
          ? context.setSelectedImageTypes((prev) => ({ ...prev, [ext]: checked }))
          : context.setSelectedVideoTypes((prev) => ({ ...prev, [ext]: checked }))
      }
    />
  );
};

export default ExtCheckbox;
