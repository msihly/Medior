import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { Checkbox } from "components";

const ExtCheckbox = observer(({ ext, label = null, type }: any) => {
  const { fileStore } = useStores();

  return (
    <Checkbox
      label={label || ext}
      checked={fileStore[`selected${type}Types`][ext]}
      setChecked={(checked) => fileStore[`setSelected${type}Types`]({ [ext]: checked })}
    />
  );
});

export default ExtCheckbox;
