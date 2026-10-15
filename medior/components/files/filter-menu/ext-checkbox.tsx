import { Checkbox, Comp } from "medior/components";
import { AudioCodec, ImageExt, VideoCodec, VideoExt } from "medior/utils/common";

export interface ExtCheckboxProps {
  ext: AudioCodec | ImageExt | VideoCodec | VideoExt;
  selected: Record<string, boolean>;
  setSelected: (selected: Record<string, boolean>) => void;
}

export const ExtCheckbox = Comp(({ ext, selected, setSelected }: ExtCheckboxProps) => {
  return (
    <Checkbox
      label={ext}
      checked={selected[ext]}
      setChecked={(checked) => setSelected({ [ext]: checked })}
    />
  );
});
