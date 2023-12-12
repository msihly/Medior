import { Fragment } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { Button, Text } from "components";
import { colors } from "utils";
import Color from "color";

export interface RootFolderButtonProps {
  folderPart: string;
  index: number;
}

export const RootFolderButton = observer(({ folderPart, index }: RootFolderButtonProps) => {
  const { importStore } = useStores();

  const isSelected = importStore.editorRootFolderIndex === index;

  const handleClick = () => importStore.setEditorRootFolderIndex(index);

  return (
    <Fragment key={index}>
      {index !== 0 && <Text margin="0 0.3em">{"\\"}</Text>}
      <Button
        type="link"
        text={folderPart}
        onClick={handleClick}
        fontWeight={500}
        textColor={isSelected ? colors.blue["400"] : Color(colors.blue["200"]).fade(0.3).string()}
      />
    </Fragment>
  );
});
