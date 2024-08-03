import { Fragment } from "react";
import { observer, useStores } from "src/store";
import { Button, Text } from "src/components";
import { colors } from "src/utils";
import Color from "color";

export interface RootFolderButtonProps {
  folderPart: string;
  index: number;
}

export const RootFolderButton = observer(({ folderPart, index }: RootFolderButtonProps) => {
  const stores = useStores();

  const isSelected = stores.import.editorRootFolderIndex === index;

  const handleClick = () => stores.import.setEditorRootFolderIndex(index);

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
