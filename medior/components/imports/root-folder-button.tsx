import { Fragment } from "react";
import Color from "color";
import { Button, Comp, Text } from "medior/components";
import { useStores } from "medior/store";
import { colors } from "medior/utils/client";

export interface RootFolderButtonProps {
  folderPart: string;
  index: number;
}

export const RootFolderButton = Comp(({ folderPart, index }: RootFolderButtonProps) => {
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
