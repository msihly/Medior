import { Checkbox } from "medior/components";
import { Comp } from "medior/components/comp";
import { AudioCodec, ImageExt, VideoCodec, VideoExt } from "medior/utils/common";

export interface ExtCheckboxProps {
  ext: AudioCodec | ImageExt | VideoCodec | VideoExt;
  label?: string;
  selected: Record<string, boolean>;
  setSelected: (selected: Record<string, boolean>) => void;
}

export const ExtCheckbox = Comp(
  ({ ext, label = null, selected, setSelected }: ExtCheckboxProps) => {
    return (
      <Checkbox
        label={label || ext}
        checked={selected[ext]}
        setChecked={(checked) => setSelected({ [ext]: checked })}
      />
    );
  },
);
