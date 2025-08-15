import { Checkbox } from "medior/components";
import { Comp } from "medior/components/comp";
import { FileSearch } from "medior/store";
import { ImageExt, VideoCodec, VideoExt } from "medior/utils/common";

export interface ExtCheckboxProps {
  ext: ImageExt | VideoCodec | VideoExt;
  label?: string;
  store: FileSearch;
  type: "ImageExt" | "VideoCodec" | "VideoExt";
}

export const ExtCheckbox = Comp(({ ext, label = null, store, type }: ExtCheckboxProps) => {
  return (
    <Checkbox
      label={label || ext}
      checked={
        type === "ImageExt"
          ? store.selectedImageExts[ext]
          : type === "VideoExt"
            ? store.selectedVideoExts[ext]
            : store.selectedVideoCodecs[ext]
      }
      setChecked={(checked) =>
        type === "ImageExt"
          ? store.setSelectedImageExts({ [ext]: checked })
          : type === "VideoExt"
            ? store.setSelectedVideoExts({ [ext]: checked })
            : store.setSelectedVideoCodecs({ [ext]: checked })
      }
    />
  );
});
