import { Fragment } from "react";
import Color from "color";
import { Button, Comp, Text } from "medior/components";
import { Ingester, Reingester } from "medior/store";
import { colors } from "medior/utils/client";

export interface RootFolderButtonProps {
  folderPart: string;
  index: number;
  store: Ingester | Reingester;
}

export const RootFolderButton = Comp(({ folderPart, index, store }: RootFolderButtonProps) => {
  const isSelected = store.rootFolderIndex === index;

  const handleClick = () => store.setRootFolderIndex(index);

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
