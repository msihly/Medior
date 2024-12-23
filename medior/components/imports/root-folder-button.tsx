import { Fragment } from "react";
import { observer, useStores } from "medior/store";
import { Button, Text } from "medior/components";
import { colors } from "medior/utils";
import Color from "color";

export interface RootFolderButtonProps {
  folderPart: string;
  index: number;
}

export const RootFolderButton = observer(({ folderPart, index }: RootFolderButtonProps) => {
  const stores = useStores();

  const isSelected = stores.import.editor.rootFolderIndex === index;

  const handleClick = () => stores.import.editor.setRootFolderIndex(index);

  return (
    <Fragment key={index}>
      {index !== 0 && <Text margin="0 0.3em">{"\\"}</Text>}
      <Button
        type="link"
        text={folderPart}
        onClick={handleClick}
        fontWeight={500}
        textColor={Color(colors.custom.lightBlue)
          .fade(!isSelected ? 0.3 : 0)
          .string()}
      />
    </Fragment>
  );
});
